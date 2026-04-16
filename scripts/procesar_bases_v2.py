#!/usr/bin/env python3
"""
FINDY BUSCADOR — Procesador v2 (rápido)
Skip validation — procesa directo, mapea lo que encuentre.
"""

import os, re, json, time, sys
import pandas as pd
import requests
from pathlib import Path
from datetime import datetime

HOME = str(Path.home())
PROJECT_DIR = os.path.join(HOME, "PROYECTOS_ANTIGRAVITY", "findy-buscador")
OUTPUT_DIR = os.path.join(HOME, "Desktop", "PROYECTO_FINDY_BASE_DATOS_TOTAL")
CHUNK_SIZE = 200

# Load keys
SUPABASE_URL = ""
SUPABASE_KEY = ""
env_path = os.path.join(PROJECT_DIR, ".env")
if os.path.exists(env_path):
    for line in open(env_path):
        if line.startswith("VITE_SUPABASE_URL="): SUPABASE_URL = line.split("=",1)[1].strip()
        elif line.startswith("VITE_SUPABASE_ANON_KEY="): SUPABASE_KEY = line.split("=",1)[1].strip()

FILE_EXCLUDE = ["liquidacion","nomina","factura","pago","euros","plantilla","~$","template"]
COL_EXCLUDE_KW = ["importe","precio","coste","euros","€","$","factura","liquidacion","comision","pago","saldo","total","subtotal","iva","impuesto"]

def limpiar(val):
    if pd.isna(val) or val is None: return None
    v = str(val).strip()
    if not v or v.lower() in ("nan","none","null",""): return None
    v = re.sub(r'<[^>]+>', ' ', v)
    v = re.sub(r'^(NIF|NIE|DNI|CIF)\s*:?\s*', '', v, flags=re.IGNORECASE)
    v = re.sub(r'Persona\s+[A-Za-záéíóúÁÉÍÓÚ\s\-]+$', '', v, flags=re.IGNORECASE)
    v = re.sub(r'\.0$', '', v)
    return v.strip() or None

def limpiar_dni(val):
    v = limpiar(val)
    if not v: return None
    m = re.search(r'([A-Za-z]?\d{7,8}[A-Za-z]?)', v)
    return m.group(1).upper() if m else v

def limpiar_tel(val):
    v = limpiar(val)
    if not v: return None
    v = re.sub(r'[^\d+]', '', v)
    if v.startswith('+34'): v = v[3:]
    elif re.match(r'^34[6789]', v) and len(v) >= 11: v = v[2:]
    return v if len(v) >= 6 else None

def mapear_col(col):
    cl = col.lower().strip()
    if any(k in cl for k in ["cups","cup "]): return "cups"
    if any(k in cl for k in ["dni","nif","nie","documento"]): return "dni"
    if any(k in cl for k in ["nombre","titular","razon social"]): return "nombre"
    if any(k in cl for k in ["direccion","domicilio","calle"]): return "direccion"
    if any(k in cl for k in ["campan","comercializadora","compan"]): return "campana"
    if any(k in cl for k in ["estado","status","situacion"]): return "estado"
    return None

def es_col_tel(col):
    cl = col.lower().replace(" ","")
    return any(k in cl for k in ["tel","tlfn","mov","phone","mobile"])

def es_col_excluida(col):
    cl = col.lower()
    return any(k in cl for k in COL_EXCLUDE_KW)

def escanear():
    dirs = [os.path.join(HOME,d) for d in ["Desktop","Downloads","Documents","PROYECTOS_ANTIGRAVITY"]]
    archivos = []
    for base in dirs:
        if not os.path.exists(base): continue
        for root, subdirs, files in os.walk(base):
            subdirs[:] = [d for d in subdirs if not d.startswith('.') and d not in ('node_modules','dist','.git','__pycache__')]
            for f in files:
                if not (f.endswith('.xlsx') or f.endswith('.xls')): continue
                if f.startswith('~') or f.startswith('.'): continue
                fl = f.lower()
                if any(ex in fl for ex in FILE_EXCLUDE): continue
                archivos.append(os.path.join(root, f))
    return sorted(set(archivos))

def procesar_archivo(filepath):
    try:
        engine = 'openpyxl' if filepath.endswith('.xlsx') else 'xlrd'
        df = pd.read_excel(filepath, engine=engine, dtype=str, nrows=50000)
    except:
        return []

    if df.empty: return []

    # Filter columns
    cols = [c for c in df.columns if not es_col_excluida(str(c))]
    if not cols: return []
    df = df[cols]

    # Check if has any relevant column
    col_map = {}
    has_relevant = False
    for col in df.columns:
        mapped = mapear_col(str(col))
        col_map[col] = mapped
        if mapped in ("cups","dni","nombre"): has_relevant = True

    if not has_relevant: return []

    campos_bd = {"cups","dni","nombre","direccion","campana","estado"}
    registros = []

    for _, row in df.iterrows():
        reg = {"datos_extra": {}}
        for col, val in row.items():
            campo = col_map.get(col)
            if campo == "dni":
                clean = limpiar_dni(val)
            elif es_col_tel(str(col)):
                clean = limpiar_tel(val)
            else:
                clean = limpiar(val)
            if not clean: continue

            if campo and campo in campos_bd:
                reg[campo] = clean
            else:
                reg["datos_extra"][str(col)] = clean

        if not reg.get("datos_extra"): reg["datos_extra"] = None
        if not reg.get("cups") and not reg.get("dni") and not reg.get("nombre"): continue
        registros.append(reg)

    return registros

def deduplicar(registros):
    cups_best = {}
    sin_cups = []
    def contar(r):
        n = sum(1 for k in ["cups","dni","nombre","direccion","campana","estado"] if r.get(k))
        if r.get("datos_extra"): n += sum(1 for v in r["datos_extra"].values() if v)
        return n

    for reg in registros:
        cups = (reg.get("cups") or "").strip()
        if cups:
            if cups not in cups_best or contar(reg) > contar(cups_best[cups]):
                cups_best[cups] = reg
        else:
            sin_cups.append(reg)
    return list(cups_best.values()) + sin_cups

def cargar(registros):
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("⚠️  Sin credenciales Supabase")
        return 0, 0
    url = f"{SUPABASE_URL}/rest/v1/rpc/bulk_upsert_clientes"
    headers = {"Content-Type":"application/json","apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}","Prefer":"return=representation"}
    ins_total, upd_total = 0, 0
    total = len(registros)
    for i in range(0, total, CHUNK_SIZE):
        chunk = registros[i:i+CHUNK_SIZE]
        try:
            r = requests.post(url, headers=headers, json={"registros":chunk}, timeout=30)
            if r.ok:
                d = r.json()
                ins = d.get("insertados",0); upd = d.get("actualizados",0)
                ins_total += ins; upd_total += upd
                pct = round((i+len(chunk))/total*100)
                print(f"\r  📤 {i+len(chunk):,}/{total:,} ({pct}%) — {ins_total:,} nuevos, {upd_total:,} act", end="", flush=True)
            else:
                print(f"\n  ❌ HTTP {r.status_code}: {r.text[:100]}")
        except Exception as e:
            print(f"\n  ❌ {e}")
        time.sleep(0.05)
    print()
    return ins_total, upd_total

def main():
    t0 = time.time()
    print("="*60)
    print("FINDY — Procesador de Bases v2 (rápido)")
    print("="*60)

    print("\n📂 Escaneando archivos...")
    archivos = escanear()
    print(f"  {len(archivos)} archivos Excel encontrados")

    print(f"\n⚙️  Procesando {len(archivos)} archivos...")
    todos = []
    procesados = 0
    validos = 0
    informe = []

    for i, filepath in enumerate(archivos):
        nombre = os.path.basename(filepath)
        regs = procesar_archivo(filepath)
        procesados += 1
        if regs:
            validos += 1
            todos.extend(regs)
            informe.append(f"✅ {nombre}: {len(regs)} registros")
            print(f"\r  [{procesados}/{len(archivos)}] ✅ {nombre}: {len(regs):,} regs (total: {len(todos):,})", end="", flush=True)
        else:
            informe.append(f"⏭️ {nombre}: 0 registros")
            if procesados % 50 == 0:
                print(f"\r  [{procesados}/{len(archivos)}] procesando... (total regs: {len(todos):,})", end="", flush=True)

    print(f"\n\n  Archivos válidos: {validos}/{len(archivos)}")
    print(f"  Total registros: {len(todos):,}")

    print(f"\n🔄 Deduplicando por CUPS...")
    limpios = deduplicar(todos)
    print(f"  Únicos: {len(limpios):,} (eliminados: {len(todos)-len(limpios):,})")

    # Save
    print(f"\n💾 Guardando en {OUTPUT_DIR}...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    try:
        df = pd.DataFrame(limpios)
        if "datos_extra" in df.columns:
            extras = df["datos_extra"].apply(lambda x: x if isinstance(x,dict) else {})
            df = pd.concat([df.drop(columns=["datos_extra"]), pd.json_normalize(extras)], axis=1)
        out = os.path.join(OUTPUT_DIR, "base_datos_completa.xlsx")
        df.to_excel(out, index=False)
        print(f"  ✅ {out} ({len(df):,} filas)")
    except Exception as e:
        print(f"  ❌ Error guardando Excel: {e}")

    # Report
    report = os.path.join(OUTPUT_DIR, "informe.txt")
    with open(report, "w") as f:
        f.write(f"FINDY — Informe {datetime.now()}\n{'='*50}\n")
        f.write(f"Archivos: {len(archivos)} escaneados, {validos} válidos\n")
        f.write(f"Registros: {len(todos):,} total, {len(limpios):,} únicos\n\n")
        for line in informe: f.write(f"  {line}\n")
    print(f"  ✅ {report}")

    # Upload
    print(f"\n🚀 Cargando {len(limpios):,} registros a Supabase...")
    ins, upd = cargar(limpios)

    elapsed = time.time() - t0
    print(f"\n{'='*60}")
    print(f"📊 RESUMEN — {elapsed/60:.1f} minutos")
    print(f"{'='*60}")
    print(f"  Archivos: {validos}/{len(archivos)}")
    print(f"  Registros: {len(todos):,} → {len(limpios):,} únicos")
    print(f"  Supabase: {ins:,} nuevos, {upd:,} actualizados")
    print(f"  Guardado: {OUTPUT_DIR}")
    print("="*60)

if __name__ == "__main__":
    main()
