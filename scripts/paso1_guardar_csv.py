#!/usr/bin/env python3
"""PASO 1: Leer todos los Excel y guardar directo a CSV (sin dedup, sin acumular en RAM)"""
import pandas as pd, os, glob, re, csv, time, sys, warnings, json
warnings.filterwarnings('ignore')

OUT = os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL')
os.makedirs(OUT, exist_ok=True)
CSV_PATH = os.path.join(OUT, 'raw_sin_dedup.csv')

EXCL_NAME = ['liquidacion','nomina','factura','pago','euros','comision','~$','plantilla']
EXCL_COL = ['importe','precio','coste','euros','€','$','factura','liquidacion','comision','pago','saldo','total','subtotal','iva','impuesto']

def campo(col):
    c = str(col).lower().replace(' ','').replace('_','')
    if 'cups' in c: return 'cups'
    if any(x in c for x in ['dni','nif','nie']): return 'dni'
    if any(x in c for x in ['nombre','titular']): return 'nombre'
    if any(x in c for x in ['direccion','calle','domicilio']): return 'direccion'
    if 'campan' in c or 'comercializador' in c: return 'campana'
    if 'estado' in c or 'status' in c: return 'estado'
    return None

def col_ok(c):
    return not any(x in str(c).lower() for x in EXCL_COL)

def limpiar(v):
    if pd.isna(v): return ''
    s = str(v).strip()
    if s.lower() in ('nan','none','null',''): return ''
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'^(NIF|NIE|DNI|CIF)\s*:?\s*', '', s, flags=re.I)
    s = re.sub(r'Persona\s+\w+.*$', '', s, flags=re.I).strip()
    s = re.sub(r'\.0$', '', s)
    return s

t0 = time.time()
print("="*60)
print("PASO 1: Leer Excel → CSV sin dedup")
print("="*60)

# Scan
rutas = set()
for b in [os.path.expanduser(d) for d in ['~/Desktop','~/Downloads','~/Documents','~/PROYECTOS_ANTIGRAVITY']]:
    if os.path.exists(b):
        for ext in ['**/*.xlsx','**/*.xls']:
            rutas.update(glob.glob(os.path.join(b,ext),recursive=True))
rutas = sorted([r for r in rutas
    if not os.path.basename(r).startswith('~')
    and not os.path.basename(r).startswith('.')
    and not any(x in os.path.basename(r).lower() for x in EXCL_NAME)])
print(f"\n📂 {len(rutas)} archivos")

# Write CSV header + rows streaming
BD_COLS = ['cups','dni','nombre','direccion','campana','estado','datos_extra','archivo_origen']
total_filas = 0
validos = 0

with open(CSV_PATH, 'w', newline='', encoding='utf-8') as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=BD_COLS)
    writer.writeheader()

    for i, path in enumerate(rutas):
        try:
            eng = 'openpyxl' if path.endswith('.xlsx') else 'xlrd'
            df = pd.read_excel(path, nrows=50000, dtype=str, engine=eng)
        except:
            continue

        if df.empty: continue
        df.columns = [str(c) for c in df.columns]
        cols = [c for c in df.columns if col_ok(c)]
        if not cols: continue

        col_map = {c: campo(c) for c in cols}
        if not any(v in ('cups','dni','nombre') for v in col_map.values()): continue

        extras = [c for c in cols if col_map[c] is None]
        mapped = {c: v for c, v in col_map.items() if v is not None}

        validos += 1
        nombre_archivo = os.path.basename(path)
        count = 0

        for _, row in df[cols].iterrows():
            reg = {'archivo_origen': nombre_archivo}
            has_data = False

            for c, dest in mapped.items():
                v = limpiar(row.get(c, ''))
                if v:
                    reg[dest] = v
                    has_data = True

            # Build datos_extra as JSON
            extra_dict = {}
            for c in extras:
                v = limpiar(row.get(c, ''))
                if v:
                    extra_dict[str(c)] = v
            reg['datos_extra'] = json.dumps(extra_dict) if extra_dict else ''

            if has_data and (reg.get('cups') or reg.get('dni') or reg.get('nombre')):
                writer.writerow(reg)
                count += 1

        total_filas += count
        if count > 0:
            print(f"  [{i+1}/{len(rutas)}] ✅ {nombre_archivo}: {count:,} filas (total: {total_filas:,})")
        elif (i+1) % 100 == 0:
            print(f"  [{i+1}/{len(rutas)}] procesando...")

csv_size = os.path.getsize(CSV_PATH) / 1024 / 1024
elapsed = time.time() - t0
print(f"\n{'='*60}")
print(f"✅ PASO 1 COMPLETADO en {elapsed/60:.1f} min")
print(f"  Archivos: {validos}/{len(rutas)}")
print(f"  Filas escritas: {total_filas:,}")
print(f"  CSV: {CSV_PATH} ({csv_size:.1f} MB)")
print("="*60)
