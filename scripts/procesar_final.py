#!/usr/bin/env python3
"""FINDY — v5 FINAL: pandas vectorizado, sin iterrows, sin to_dict por fila"""
import pandas as pd, os, glob, requests, re, time, sys, warnings, json
warnings.filterwarnings('ignore')

env = open('/Users/john/PROYECTOS_ANTIGRAVITY/findy-buscador/.env').read()
API_KEY = re.search(r'VITE_SUPABASE_ANON_KEY=(.+)', env).group(1).strip()
URL = "https://gqvkrlacbvuhfbjqltqp.supabase.co"
EXCL_NAME = ['liquidacion','nomina','factura','pago','euros','comision','~$','plantilla']
EXCL_COL = ['importe','precio','coste','euros','€','$','factura','liquidacion','comision','pago','saldo','total','subtotal','iva','impuesto']
OUT = os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL')

def campo(col):
    c = col.lower().replace(' ','').replace('_','')
    if 'cups' in c: return 'cups'
    if any(x in c for x in ['dni','nif','nie']): return 'dni'
    if any(x in c for x in ['nombre','titular']): return 'nombre'
    if any(x in c for x in ['direccion','calle','domicilio']): return 'direccion'
    if 'campan' in c or 'comercializador' in c: return 'campana'
    if 'estado' in c or 'status' in c: return 'estado'
    return None

def col_ok(c):
    return not any(x in c.lower() for x in EXCL_COL)

def limpiar_serie(s):
    """Vectorized cleaning of a pandas Series"""
    s = s.astype(str)
    s = s.str.strip()
    s = s.str.replace(r'<[^>]+>', '', regex=True)
    s = s.str.replace(r'^(NIF|NIE|DNI|CIF)\s*:?\s*', '', regex=True, case=False)
    s = s.str.replace(r'Persona\s+\w+.*$', '', regex=True, case=False)
    s = s.str.replace(r'\.0$', '', regex=True)
    s = s.replace(['nan','None','none','null','','NaN'], pd.NA)
    return s

def leer_archivo(path):
    """Read one Excel, return DataFrame with standardized columns"""
    try:
        eng = 'openpyxl' if path.endswith('.xlsx') else 'xlrd'
        df = pd.read_excel(path, nrows=50000, dtype=str, engine=eng)
    except:
        return None
    if df.empty or len(df) < 1:
        return None

    # Filter columns
    # Ensure all column names are strings
    df.columns = [str(c) for c in df.columns]
    cols = [c for c in df.columns if col_ok(c)]
    if not cols:
        return None

    # Map columns
    mapping = {}
    extras = []
    has_key = False
    for c in cols:
        mapped = campo(str(c))
        if mapped:
            mapping[c] = mapped
            if mapped in ('cups', 'dni', 'nombre'):
                has_key = True
        else:
            extras.append(c)

    if not has_key:
        return None

    # Rename mapped columns
    df_out = pd.DataFrame()
    for orig, dest in mapping.items():
        if dest not in df_out.columns:
            df_out[dest] = limpiar_serie(df[orig])

    # Pack extras into datos_extra JSON
    if extras:
        def make_extra(row):
            d = {}
            for c in extras:
                v = row.get(c)
                if pd.notna(v):
                    vs = str(v).strip()
                    if vs and vs.lower() not in ('nan','none','null'):
                        vs = re.sub(r'\.0$', '', vs)
                        # Clean phone prefixes
                        cl = str(c).lower().replace(' ','')
                        if any(k in cl for k in ['tel','tlfn','mov','phone']):
                            if vs.startswith('+34') and len(vs) >= 12: vs = vs[3:]
                            elif re.match(r'^34[6789]', vs) and len(vs) >= 11: vs = vs[2:]
                        if vs:
                            d[str(c)] = vs
            return json.dumps(d) if d else None
        df_out['datos_extra'] = df[extras].apply(make_extra, axis=1)
    else:
        df_out['datos_extra'] = None

    # Drop rows with no useful data
    key_cols = [c for c in ['cups','dni','nombre'] if c in df_out.columns]
    if key_cols:
        mask = df_out[key_cols].notna().any(axis=1)
        df_out = df_out[mask]

    return df_out if len(df_out) > 0 else None

def cargar_supabase(registros):
    """Upload list of dicts to Supabase"""
    h = {'Content-Type':'application/json','apikey':API_KEY,'Authorization':f'Bearer {API_KEY}','Prefer':'return=representation'}
    ins = upd = err = 0
    total = len(registros)
    for i in range(0, total, 200):
        chunk = registros[i:i+200]
        try:
            r = requests.post(f"{URL}/rest/v1/rpc/bulk_upsert_clientes", headers=h, json={'registros': chunk}, timeout=30)
            if r.ok:
                d = r.json()
                ins += d.get('insertados', 0)
                upd += d.get('actualizados', 0)
            else:
                err += len(chunk)
        except:
            err += len(chunk)
        done = i + len(chunk)
        if done % 2000 < 200:
            print(f"  📤 {done:,}/{total:,} ({round(done/total*100)}%) — {ins:,} nuevos, {upd:,} act, {err:,} err")
        time.sleep(0.03)
    return ins, upd, err

# ═══ MAIN ═══
t0 = time.time()
print("=" * 60)
print("FINDY — Procesador FINAL v5 (vectorizado)")
print("=" * 60)

# Scan
rutas = set()
for b in [os.path.expanduser(d) for d in ['~/Desktop','~/Downloads','~/Documents','~/PROYECTOS_ANTIGRAVITY']]:
    if os.path.exists(b):
        for ext in ['**/*.xlsx', '**/*.xls']:
            rutas.update(glob.glob(os.path.join(b, ext), recursive=True))
rutas = sorted([r for r in rutas
    if not os.path.basename(r).startswith('~')
    and not os.path.basename(r).startswith('.')
    and not any(x in os.path.basename(r).lower() for x in EXCL_NAME)])
print(f"\n📂 {len(rutas)} archivos encontrados")

# Process — concat DataFrames instead of appending dicts
print(f"\n⚙️  Leyendo archivos...")
frames = []
validos = 0
for i, path in enumerate(rutas):
    df = leer_archivo(path)
    if df is not None and len(df) > 0:
        validos += 1
        frames.append(df)
        print(f"  [{i+1}/{len(rutas)}] ✅ {os.path.basename(path)}: {len(df):,} filas (acum: {sum(len(f) for f in frames):,})")
    elif (i+1) % 100 == 0:
        print(f"  [{i+1}/{len(rutas)}] procesando...")

total_filas = sum(len(f) for f in frames)
print(f"\n  ✅ {validos} archivos válidos → {total_filas:,} filas")

if not frames:
    print("❌ No se encontraron datos")
    sys.exit(1)

# Concat all
print(f"\n🔗 Concatenando {len(frames)} DataFrames...")
df_all = pd.concat(frames, ignore_index=True)
del frames  # free memory
print(f"  {len(df_all):,} filas totales")

# Dedup by CUPS
print(f"\n🔄 Deduplicando por CUPS...")
has_cups = df_all['cups'].notna() if 'cups' in df_all.columns else pd.Series(False, index=df_all.index)
df_cups = df_all[has_cups].drop_duplicates(subset='cups', keep='first')
df_no_cups = df_all[~has_cups]
df_final = pd.concat([df_cups, df_no_cups], ignore_index=True)
eliminados = len(df_all) - len(df_final)
del df_all
print(f"  Con CUPS: {len(df_cups):,}")
print(f"  Sin CUPS: {len(df_no_cups):,}")
print(f"  Total únicos: {len(df_final):,} (eliminados: {eliminados:,})")

# Save
print(f"\n💾 Guardando...")
os.makedirs(OUT, exist_ok=True)
csv_path = os.path.join(OUT, 'base_datos_completa.csv')
df_final.to_csv(csv_path, index=False)
csv_size = os.path.getsize(csv_path) / 1024 / 1024
print(f"  ✅ {csv_path}")
print(f"  📊 {len(df_final):,} filas, {len(df_final.columns)} columnas, {csv_size:.1f} MB")

# Convert to list of dicts for Supabase
print(f"\n🚀 Preparando carga a Supabase...")
BD_COLS = {'cups','dni','nombre','direccion','campana','estado'}
registros = []
for _, row in df_final.iterrows():
    reg = {}
    for col in BD_COLS:
        if col in row and pd.notna(row[col]):
            reg[col] = str(row[col])
    # datos_extra is already JSON string
    if 'datos_extra' in row and pd.notna(row['datos_extra']):
        try:
            reg['datos_extra'] = json.loads(row['datos_extra'])
        except:
            reg['datos_extra'] = None
    else:
        reg['datos_extra'] = None
    if reg.get('cups') or reg.get('dni') or reg.get('nombre'):
        registros.append(reg)

print(f"  {len(registros):,} registros para Supabase")
print(f"\n📤 Cargando...")
ins, upd, err = cargar_supabase(registros)

elapsed = time.time() - t0
print(f"\n{'='*60}")
print(f"✅ COMPLETADO en {elapsed/60:.1f} minutos")
print(f"{'='*60}")
print(f"  Archivos: {validos}/{len(rutas)}")
print(f"  Filas leídas: {total_filas:,}")
print(f"  Únicos: {len(df_final):,}")
print(f"  CSV: {csv_path} ({csv_size:.1f} MB)")
print(f"  Supabase: {ins:,} nuevos, {upd:,} actualizados, {err:,} errores")
print("=" * 60)
