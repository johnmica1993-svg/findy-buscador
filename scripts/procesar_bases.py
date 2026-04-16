#!/usr/bin/env python3
"""
FINDY BUSCADOR — Procesador de bases de datos Excel
Escanea, limpia, deduplica y carga Excel de clientes a Supabase.
"""

import os
import re
import json
import glob
import time
import pandas as pd
import requests
from pathlib import Path
from datetime import datetime

# ─── Config ───

HOME = str(Path.home())
PROJECT_DIR = os.path.join(HOME, "PROYECTOS_ANTIGRAVITY", "findy-buscador")
OUTPUT_DIR = os.path.join(HOME, "Desktop", "PROYECTO_FINDY_BASE_DATOS_TOTAL")
CHUNK_SIZE = 200

# Load Supabase keys from .env
ENV_PATH = os.path.join(PROJECT_DIR, ".env")
SUPABASE_URL = ""
SUPABASE_KEY = ""
if os.path.exists(ENV_PATH):
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if line.startswith("VITE_SUPABASE_URL="):
                SUPABASE_URL = line.split("=", 1)[1]
            elif line.startswith("VITE_SUPABASE_ANON_KEY="):
                SUPABASE_KEY = line.split("=", 1)[1]

# Directories to scan
SCAN_DIRS = [
    os.path.join(HOME, "Desktop"),
    os.path.join(HOME, "Downloads"),
    os.path.join(HOME, "Documents"),
    os.path.join(HOME, "PROYECTOS_ANTIGRAVITY"),
]

# Keywords in folder names to include
FOLDER_KEYWORDS = ["BASE", "base", "CLIENTES", "clientes", "LEADS", "leads",
                    "CUPS", "cups", "energia", "ENERGIA", "comercial", "COMERCIAL"]

# File name exclusions
FILE_EXCLUDE = ["liquidacion", "LIQUIDACION", "nomina", "NOMINA", "factura",
                "FACTURA", "pago", "PAGO", "euros", "EUROS", "plantilla", "PLANTILLA"]

# Column include keywords (lowercase)
COL_INCLUDE = {"cups", "dni", "nif", "nie", "nombre", "apellido", "direccion", "calle",
               "numero", "piso", "cp", "codigo postal", "poblacion", "municipio",
               "ciudad", "provincia", "telefono", "tlfn", "tel", "movil", "mobile",
               "email", "correo", "iban", "cuenta", "potencia", "tarifa",
               "comercializadora", "compania", "campaña", "campana", "estado",
               "fecha", "cups_luz", "cups_gas", "suministro", "contrato", "titular"}

# Column exclude keywords (lowercase)
COL_EXCLUDE = {"importe", "precio", "coste", "euros", "€", "$", "factura",
               "liquidacion", "comision", "ingreso", "pago", "debe", "haber",
               "saldo", "total", "subtotal", "iva", "impuesto"}

# ─── Column mapping ───

def mapear_columna(col_name):
    """Map Excel column name to Supabase field."""
    cl = col_name.lower().strip()
    if any(k in cl for k in ["cups", "cup "]):
        return "cups"
    if any(k in cl for k in ["dni", "nif", "nie", "documento"]):
        return "dni"
    if any(k in cl for k in ["nombre", "titular", "razon social"]):
        return "nombre"
    if any(k in cl for k in ["direccion", "domicilio", "calle"]):
        return "direccion"
    if any(k in cl for k in ["campan", "comercializadora", "compan"]):
        return "campana"
    if any(k in cl for k in ["estado", "status", "situacion"]):
        return "estado"
    return None  # goes to datos_extra


def limpiar_valor(val):
    """Clean a cell value."""
    if pd.isna(val) or val is None:
        return None
    v = str(val).strip()
    if not v or v.lower() in ("nan", "none", "null"):
        return None
    # Remove HTML
    v = re.sub(r'<[^>]+>', ' ', v)
    # Remove NIF/DNI prefix
    v = re.sub(r'^(NIF|NIE|DNI|CIF)\s*:?\s*', '', v, flags=re.IGNORECASE)
    # Remove "Persona Física/Jurídica"
    v = re.sub(r'Persona\s+[A-Za-záéíóúÁÉÍÓÚüÜñÑ\s\-]+$', '', v, flags=re.IGNORECASE)
    # Remove .0 float suffix
    v = re.sub(r'\.0$', '', v)
    return v.strip() or None


def limpiar_telefono(val):
    """Clean phone number."""
    v = limpiar_valor(val)
    if not v:
        return None
    v = re.sub(r'[^\d+]', '', v)
    if v.startswith('+34'):
        v = v[3:]
    elif re.match(r'^34[6789]', v) and len(v) >= 11:
        v = v[2:]
    return v if len(v) >= 6 else None


def limpiar_dni(val):
    """Extract clean DNI/NIF."""
    v = limpiar_valor(val)
    if not v:
        return None
    m = re.search(r'([A-Za-z]?\d{7,8}[A-Za-z]?)', v)
    if m:
        return m.group(1).upper()
    cleaned = re.sub(r'[^A-Za-z0-9]', '', v).upper()
    if 8 <= len(cleaned) <= 10:
        return cleaned
    return v.strip()


def es_columna_valida(col_name):
    """Check if column should be included."""
    cl = col_name.lower().strip()
    # Exclude financial columns
    if any(k in cl for k in COL_EXCLUDE):
        return False
    # Include if matches known keywords
    if any(k in cl for k in COL_INCLUDE):
        return True
    # Include by default (goes to datos_extra)
    return True


def es_columna_telefono(col_name):
    """Check if column contains phone data."""
    cl = col_name.lower().replace(" ", "")
    return any(k in cl for k in ["tel", "tlfn", "mov", "phone", "mobile"])


# ─── Scanner ───

def escanear_archivos():
    """Find all Excel files in scan directories."""
    archivos = set()

    for base_dir in SCAN_DIRS:
        if not os.path.exists(base_dir):
            continue
        for root, dirs, files in os.walk(base_dir):
            # Skip hidden dirs and node_modules
            dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'node_modules' and d != 'dist']

            for f in files:
                if not (f.endswith('.xlsx') or f.endswith('.xls')):
                    continue
                if f.startswith('~') or f.startswith('.'):
                    continue
                # Exclude financial files
                if any(ex in f for ex in FILE_EXCLUDE):
                    continue
                archivos.add(os.path.join(root, f))

    return sorted(archivos)


def validar_excel(filepath):
    """Check if Excel has relevant client data columns."""
    try:
        df = pd.read_excel(filepath, nrows=2, engine='openpyxl' if filepath.endswith('.xlsx') else 'xlrd')
        cols_lower = [str(c).lower() for c in df.columns]
        has_cups = any('cups' in c for c in cols_lower)
        has_dni = any(k in c for c in cols_lower for k in ['dni', 'nif', 'nie'])
        has_iban = any('iban' in c for c in cols_lower)
        has_nombre = any(k in c for c in cols_lower for k in ['nombre', 'titular'])
        return has_cups or has_dni or has_iban or has_nombre
    except Exception:
        return False


# ─── Processor ───

def procesar_excel(filepath):
    """Read and clean one Excel file."""
    try:
        engine = 'openpyxl' if filepath.endswith('.xlsx') else 'xlrd'
        df = pd.read_excel(filepath, engine=engine, dtype=str)
    except Exception as e:
        print(f"  ❌ Error leyendo {os.path.basename(filepath)}: {e}")
        return None

    if df.empty or len(df) < 1:
        return None

    # Filter valid columns
    cols_validas = [c for c in df.columns if es_columna_valida(str(c))]
    df = df[cols_validas]

    # Remove rows that look like financial data
    def es_fila_financiera(row):
        for val in row:
            if pd.isna(val):
                continue
            v = str(val)
            if '€' in v or 'EUR' in v:
                return True
        return False

    mask = df.apply(es_fila_financiera, axis=1)
    df = df[~mask]

    return df


def mapear_a_registros(df, source_file=""):
    """Convert DataFrame rows to Supabase records."""
    registros = []
    campos_bd = {"cups", "dni", "nombre", "direccion", "campana", "estado"}

    # Map columns
    col_map = {}
    for col in df.columns:
        mapped = mapear_columna(str(col))
        col_map[col] = mapped

    for _, row in df.iterrows():
        reg = {"datos_extra": {}}

        for col, val in row.items():
            campo = col_map.get(col)
            clean_val = None

            if campo == "dni":
                clean_val = limpiar_dni(val)
            elif es_columna_telefono(str(col)):
                clean_val = limpiar_telefono(val)
            else:
                clean_val = limpiar_valor(val)

            if clean_val is None:
                continue

            if campo and campo in campos_bd:
                reg[campo] = clean_val
            else:
                reg["datos_extra"][str(col)] = clean_val

        if not reg.get("datos_extra"):
            reg["datos_extra"] = None

        # Skip completely empty records
        if not reg.get("cups") and not reg.get("dni") and not reg.get("nombre"):
            continue

        registros.append(reg)

    return registros


def deduplicar(registros):
    """Deduplicate by CUPS, keeping record with most fields."""
    cups_best = {}
    sin_cups = []

    def contar_campos(r):
        n = sum(1 for k in ["cups", "dni", "nombre", "direccion", "campana", "estado"] if r.get(k))
        if r.get("datos_extra"):
            n += sum(1 for v in r["datos_extra"].values() if v)
        return n

    for reg in registros:
        cups = reg.get("cups", "")
        if cups and cups.strip():
            cups = cups.strip()
            if cups not in cups_best or contar_campos(reg) > contar_campos(cups_best[cups]):
                cups_best[cups] = reg
        else:
            sin_cups.append(reg)

    return list(cups_best.values()) + sin_cups


# ─── Supabase Loader ───

def cargar_a_supabase(registros):
    """Upload records to Supabase via RPC."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("⚠️  No se encontraron credenciales de Supabase en .env")
        return 0, 0

    total_insertados = 0
    total_actualizados = 0
    total_errores = 0
    url = f"{SUPABASE_URL}/rest/v1/rpc/bulk_upsert_clientes"
    headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Prefer": "return=representation",
    }

    total = len(registros)
    for i in range(0, total, CHUNK_SIZE):
        chunk = registros[i:i + CHUNK_SIZE]
        try:
            resp = requests.post(url, headers=headers, json={"registros": chunk}, timeout=30)
            if resp.ok:
                data = resp.json()
                ins = data.get("insertados", 0)
                upd = data.get("actualizados", 0)
                total_insertados += ins
                total_actualizados += upd
                print(f"  Chunk {i // CHUNK_SIZE + 1}: {ins} nuevos, {upd} actualizados ({i + len(chunk)}/{total})")
            else:
                total_errores += len(chunk)
                print(f"  ❌ Chunk {i // CHUNK_SIZE + 1}: HTTP {resp.status_code} - {resp.text[:200]}")
        except Exception as e:
            total_errores += len(chunk)
            print(f"  ❌ Chunk {i // CHUNK_SIZE + 1}: {e}")

        time.sleep(0.1)  # small delay to not overwhelm

    return total_insertados, total_actualizados


# ─── Main ───

def main():
    print("=" * 60)
    print("FINDY BUSCADOR — Procesador de Bases de Datos")
    print("=" * 60)
    print(f"Hora: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # Phase 1: Scan
    print("📂 FASE 1: Escaneando archivos Excel...")
    archivos = escanear_archivos()
    print(f"  Encontrados: {len(archivos)} archivos Excel")

    # Phase 2: Validate
    print("\n🔍 FASE 2: Validando archivos con datos de clientes...")
    archivos_validos = []
    for f in archivos:
        if validar_excel(f):
            archivos_validos.append(f)
            print(f"  ✅ {os.path.basename(f)}")
        else:
            print(f"  ⏭️  {os.path.basename(f)} (sin columnas relevantes)")

    print(f"\n  Archivos válidos: {len(archivos_validos)}")

    if not archivos_validos:
        print("\n❌ No se encontraron archivos válidos.")
        return

    # Phase 3: Process
    print("\n⚙️  FASE 3: Procesando y limpiando datos...")
    todos_registros = []
    informe = []

    for filepath in archivos_validos:
        nombre = os.path.basename(filepath)
        print(f"\n  📄 {nombre}...")

        df = procesar_excel(filepath)
        if df is None or df.empty:
            informe.append(f"{nombre}: 0 registros (error o vacío)")
            continue

        registros = mapear_a_registros(df, nombre)
        print(f"     {len(registros)} registros extraídos")
        informe.append(f"{nombre}: {len(registros)} registros")
        todos_registros.extend(registros)

    print(f"\n  Total antes de deduplicar: {len(todos_registros)}")

    # Phase 4: Deduplicate
    print("\n🔄 FASE 4: Deduplicando por CUPS...")
    registros_limpios = deduplicar(todos_registros)
    eliminados = len(todos_registros) - len(registros_limpios)
    print(f"  Registros únicos: {len(registros_limpios)}")
    print(f"  Duplicados eliminados: {eliminados}")

    # Phase 5: Save
    print(f"\n💾 FASE 5: Guardando en {OUTPUT_DIR}...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Save complete database
    df_final = pd.DataFrame(registros_limpios)
    # Flatten datos_extra for Excel
    if "datos_extra" in df_final.columns:
        extras = df_final["datos_extra"].apply(lambda x: x if isinstance(x, dict) else {})
        extras_df = pd.json_normalize(extras)
        df_final = pd.concat([df_final.drop(columns=["datos_extra"]), extras_df], axis=1)

    output_file = os.path.join(OUTPUT_DIR, "base_datos_completa.xlsx")
    df_final.to_excel(output_file, index=False)
    print(f"  ✅ {output_file} ({len(df_final)} filas)")

    # Save report
    report_file = os.path.join(OUTPUT_DIR, "informe_procesamiento.txt")
    with open(report_file, "w") as f:
        f.write(f"FINDY BUSCADOR — Informe de Procesamiento\n")
        f.write(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"{'=' * 50}\n\n")
        f.write(f"Archivos escaneados: {len(archivos)}\n")
        f.write(f"Archivos válidos: {len(archivos_validos)}\n")
        f.write(f"Total registros antes dedup: {len(todos_registros)}\n")
        f.write(f"Duplicados eliminados: {eliminados}\n")
        f.write(f"Registros únicos finales: {len(registros_limpios)}\n\n")
        f.write("DETALLE POR ARCHIVO:\n")
        for line in informe:
            f.write(f"  {line}\n")
    print(f"  ✅ {report_file}")

    # Phase 6: Upload
    print(f"\n🚀 FASE 6: Cargando {len(registros_limpios)} registros a Supabase...")
    insertados, actualizados = cargar_a_supabase(registros_limpios)

    # Summary
    print("\n" + "=" * 60)
    print("📊 RESUMEN FINAL")
    print("=" * 60)
    print(f"  Archivos procesados: {len(archivos_validos)}")
    print(f"  Registros totales: {len(todos_registros)}")
    print(f"  Duplicados eliminados: {eliminados}")
    print(f"  Registros únicos: {len(registros_limpios)}")
    print(f"  Insertados en Supabase: {insertados}")
    print(f"  Actualizados en Supabase: {actualizados}")
    print(f"  Base guardada en: {output_file}")
    print("=" * 60)


if __name__ == "__main__":
    main()
