#!/usr/bin/env python3
"""FINDY — Procesador rápido con ThreadPool (8 workers lectura, 5 carga)"""

import pandas as pd
import os, glob, requests, json, re, time
from concurrent.futures import ThreadPoolExecutor, as_completed

SUPABASE_URL = "https://gqvkrlacbvuhfbjqltqp.supabase.co"
env_text = open('/Users/john/PROYECTOS_ANTIGRAVITY/findy-buscador/.env').read()
API_KEY = re.search(r'VITE_SUPABASE_ANON_KEY=(.+)', env_text).group(1).strip()

EXCLUIR_NOMBRES = ['liquidacion','nomina','factura','pago','euros','comision','ingreso','~$','plantilla']
EXCLUIR_COLUMNAS = ['importe','precio','coste','euros','€','$','factura','liquidacion','comision','ingreso','pago','debe','haber','saldo','iva','impuesto']
INCLUIR_COLUMNAS = ['cups','dni','nif','nie','nombre','apellido','direccion','calle','cp','postal','poblacion','municipio','ciudad','provincia','telefono','tlfn','tel','movil','email','iban','cuenta','potencia','tarifa','compan','campan','estado','fecha','titular','contrato','suministro']

def limpiar_val(v):
    if pd.isna(v): return None
    s = str(v).strip()
    if not s or s.lower() in ('nan','none','null'): return None
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'^(NIF|NIE|DNI|CIF)\s*:?\s*', '', s, flags=re.I)
    s = re.sub(r'Persona\s+\w+.*$', '', s, flags=re.I).strip()
    s = re.sub(r'\.0$', '', s)
    if s.startswith('+34') and len(s) >= 12: s = s[3:]
    elif re.match(r'^34[6789]', s) and len(s) >= 11: s = s[2:]
    return s.strip() or None

def es_columna_valida(col):
    col_l = col.lower().replace(' ','').replace('_','')
    if any(x in col_l for x in EXCLUIR_COLUMNAS): return False
    return any(x in col_l for x in INCLUIR_COLUMNAS)

def detectar_campo(col):
    col_l = col.lower().replace(' ','').replace('_','')
    if 'cups' in col_l: return 'cups'
    if any(x in col_l for x in ['dni','nif','nie']): return 'dni'
    if any(x in col_l for x in ['nombre','titular']): return 'nombre'
    if any(x in col_l for x in ['direccion','calle','domicilio']): return 'direccion'
    if 'campan' in col_l or 'comercializador' in col_l: return 'campana'
    if 'estado' in col_l or 'status' in col_l: return 'estado'
    return col

def leer_excel(path):
    try:
        nombre = os.path.basename(path).lower()
        if any(x in nombre for x in EXCLUIR_NOMBRES): return []

        engine = 'openpyxl' if path.endswith('.xlsx') else 'xlrd'
        df = pd.read_excel(path, nrows=50000, dtype=str, engine=engine)
        cols_validas = [c for c in df.columns if es_columna_valida(str(c))]
        if not cols_validas: return []

        df = df[cols_validas]
        registros = []

        for _, row in df.iterrows():
            reg = {'datos_extra': {}}
            for col in cols_validas:
                val = limpiar_val(row.get(col))
                if not val: continue
                campo = detectar_campo(str(col))
                if campo in ['cups','dni','nombre','direccion','campana','estado']:
                    reg[campo] = val
                else:
                    reg['datos_extra'][str(col)] = val

            if not reg.get('datos_extra'): reg['datos_extra'] = None
            if reg.get('cups') or reg.get('dni') or reg.get('nombre'):
                registros.append(reg)

        if registros:
            print(f"  ✓ {os.path.basename(path)}: {len(registros):,} registros")
        return registros
    except Exception as e:
        return []

def cargar_chunk(chunk):
    try:
        res = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/bulk_upsert_clientes",
            headers={'Content-Type':'application/json','apikey':API_KEY,'Authorization':f'Bearer {API_KEY}','Prefer':'return=representation'},
            json={'registros': chunk}, timeout=30
        )
        if res.ok:
            return res.json()
        else:
            return {'insertados':0,'actualizados':0}
    except:
        return {'insertados':0,'actualizados':0}

if __name__ == '__main__':
    t0 = time.time()
    print("="*60)
    print("FINDY — Procesador Rápido (8 threads)")
    print("="*60)

    # Buscar archivos
    rutas = set()
    for base in [os.path.expanduser(d) for d in ['~/Desktop','~/Downloads','~/Documents','~/PROYECTOS_ANTIGRAVITY']]:
        if os.path.exists(base):
            for ext in ['**/*.xlsx','**/*.xls']:
                rutas.update(glob.glob(os.path.join(base, ext), recursive=True))

    rutas = sorted([r for r in rutas if not os.path.basename(r).startswith('~') and not os.path.basename(r).startswith('.')])
    print(f"\n📂 {len(rutas)} archivos Excel encontrados")

    # Leer en paralelo
    print(f"\n⚙️  Leyendo con 8 threads en paralelo...")
    todos = []
    completados = 0
    with ThreadPoolExecutor(max_workers=8) as executor:
        futuros = {executor.submit(leer_excel, r): r for r in rutas}
        for futuro in as_completed(futuros):
            resultado = futuro.result()
            todos.extend(resultado)
            completados += 1
            if completados % 100 == 0:
                print(f"  📊 {completados}/{len(rutas)} archivos → {len(todos):,} registros acumulados")

    print(f"\n  ✅ {completados} archivos leídos → {len(todos):,} registros totales")

    # Deduplicar
    print(f"\n🔄 Deduplicando por CUPS...")
    por_cups = {}
    sin_cups = []
    for r in todos:
        cups = (r.get('cups') or '').strip()
        if not cups:
            sin_cups.append(r)
            continue
        if cups not in por_cups:
            por_cups[cups] = r
        else:
            n_nuevo = len([v for v in list(r.values()) if v]) + len([v for v in (r.get('datos_extra') or {}).values() if v])
            n_exist = len([v for v in list(por_cups[cups].values()) if v]) + len([v for v in (por_cups[cups].get('datos_extra') or {}).values() if v])
            if n_nuevo > n_exist:
                por_cups[cups] = r

    final = list(por_cups.values()) + sin_cups
    print(f"  Con CUPS: {len(por_cups):,}")
    print(f"  Sin CUPS: {len(sin_cups):,}")
    print(f"  Total únicos: {len(final):,} (eliminados: {len(todos)-len(final):,})")

    # Guardar Excel
    print(f"\n💾 Guardando Excel...")
    os.makedirs(os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL'), exist_ok=True)
    try:
        df_final = pd.DataFrame(final)
        if 'datos_extra' in df_final.columns:
            extras = df_final['datos_extra'].apply(lambda x: x if isinstance(x,dict) else {})
            df_final = pd.concat([df_final.drop(columns=['datos_extra']), pd.json_normalize(extras)], axis=1)
        out = os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL/base_datos_completa.xlsx')
        df_final.to_excel(out, index=False)
        print(f"  ✅ {out} ({len(df_final):,} filas)")
    except Exception as e:
        print(f"  ❌ Error Excel: {e}")
        # Guardar como CSV si Excel falla (demasiadas filas)
        try:
            out_csv = os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL/base_datos_completa.csv')
            df_final.to_csv(out_csv, index=False)
            print(f"  ✅ Guardado como CSV: {out_csv}")
        except: pass

    # Cargar a Supabase
    CHUNK = 200
    chunks = [final[i:i+CHUNK] for i in range(0, len(final), CHUNK)]
    print(f"\n🚀 Cargando {len(chunks):,} chunks a Supabase (5 threads)...")

    total_ins = 0
    total_upd = 0
    cargados = 0

    with ThreadPoolExecutor(max_workers=5) as executor:
        futuros = {executor.submit(cargar_chunk, c): i for i, c in enumerate(chunks)}
        for futuro in as_completed(futuros):
            r = futuro.result()
            total_ins += r.get('insertados', 0)
            total_upd += r.get('actualizados', 0)
            cargados += 1
            if cargados % 50 == 0:
                pct = round(cargados/len(chunks)*100)
                print(f"  📤 {cargados}/{len(chunks)} ({pct}%) — {total_ins:,} nuevos, {total_upd:,} actualizados")

    elapsed = time.time() - t0
    print(f"\n{'='*60}")
    print(f"📊 COMPLETADO en {elapsed/60:.1f} minutos")
    print(f"{'='*60}")
    print(f"  Archivos leídos: {completados}")
    print(f"  Registros totales: {len(todos):,}")
    print(f"  Registros únicos: {len(final):,}")
    print(f"  Insertados: {total_ins:,}")
    print(f"  Actualizados: {total_upd:,}")
    print(f"  Base guardada en: ~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL/")
    print("="*60)
