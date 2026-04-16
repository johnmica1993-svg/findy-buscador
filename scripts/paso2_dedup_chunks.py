#!/usr/bin/env python3
"""PASO 2: Deduplicar CSV por CUPS en chunks (no necesita toda la RAM)"""
import pandas as pd, os, time, sys, json, requests, re

OUT = os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL')
RAW_CSV = os.path.join(OUT, 'raw_sin_dedup.csv')
FINAL_CSV = os.path.join(OUT, 'base_datos_completa.csv')
CHUNK = 500000  # 500k filas por chunk

env = open('/Users/john/PROYECTOS_ANTIGRAVITY/findy-buscador/.env').read()
API_KEY = re.search(r'VITE_SUPABASE_ANON_KEY=(.+)', env).group(1).strip()
URL = "https://gqvkrlacbvuhfbjqltqp.supabase.co"

t0 = time.time()
print("="*60)
print("PASO 2: Deduplicar por CUPS + cargar a Supabase")
print("="*60)

# Count total lines
print("\n📊 Contando filas...")
total = sum(1 for _ in open(RAW_CSV, encoding='utf-8')) - 1  # minus header
print(f"  {total:,} filas en {RAW_CSV}")

# Pass 1: collect best CUPS (most non-empty fields)
print(f"\n🔄 Pass 1: Encontrando mejor registro por CUPS...")
cups_best_count = {}  # cups → (row_number, field_count)
cups_seen = set()
sin_cups_count = 0

for chunk_df in pd.read_csv(RAW_CSV, chunksize=CHUNK, dtype=str, keep_default_na=False):
    for idx, row in chunk_df.iterrows():
        cups = (row.get('cups') or '').strip()
        if not cups:
            sin_cups_count += 1
            continue
        field_count = sum(1 for v in row if v and str(v).strip())
        if cups not in cups_best_count or field_count > cups_best_count[cups][1]:
            cups_best_count[cups] = (idx, field_count)
        cups_seen.add(cups)

    processed = len(cups_seen) + sin_cups_count
    print(f"\r  CUPS únicos: {len(cups_seen):,} | Sin CUPS: {sin_cups_count:,}", end="", flush=True)

print(f"\n  Total CUPS únicos: {len(cups_seen):,}")
print(f"  Sin CUPS: {sin_cups_count:,}")
print(f"  Total único estimado: {len(cups_seen) + sin_cups_count:,}")

# Pass 2: Write deduplicated CSV
print(f"\n📝 Pass 2: Escribiendo CSV deduplicado...")
best_indices = set(idx for idx, _ in cups_best_count.values())
written = 0
first = True

for chunk_df in pd.read_csv(RAW_CSV, chunksize=CHUNK, dtype=str, keep_default_na=False):
    # Keep: rows with best CUPS index OR rows without CUPS
    mask = chunk_df.index.isin(best_indices) | (chunk_df['cups'].str.strip() == '') | (chunk_df['cups'].isna())
    filtered = chunk_df[mask]

    if first:
        filtered.to_csv(FINAL_CSV, index=False, mode='w')
        first = False
    else:
        filtered.to_csv(FINAL_CSV, index=False, mode='a', header=False)

    written += len(filtered)
    print(f"\r  Escritas: {written:,}", end="", flush=True)

final_size = os.path.getsize(FINAL_CSV) / 1024 / 1024
print(f"\n  ✅ {FINAL_CSV} ({written:,} filas, {final_size:.1f} MB)")

# Pass 3: Upload to Supabase
print(f"\n🚀 Pass 3: Cargando a Supabase...")
h = {'Content-Type':'application/json','apikey':API_KEY,'Authorization':f'Bearer {API_KEY}','Prefer':'return=representation'}
ins_total = upd_total = err_total = 0
uploaded = 0
BD_COLS = {'cups','dni','nombre','direccion','campana','estado'}

for chunk_df in pd.read_csv(FINAL_CSV, chunksize=200, dtype=str, keep_default_na=False):
    registros = []
    for _, row in chunk_df.iterrows():
        reg = {}
        for col in BD_COLS:
            v = row.get(col, '').strip()
            if v: reg[col] = v
        extra = row.get('datos_extra', '').strip()
        if extra:
            try: reg['datos_extra'] = json.loads(extra)
            except: reg['datos_extra'] = None
        else:
            reg['datos_extra'] = None
        if reg.get('cups') or reg.get('dni') or reg.get('nombre'):
            registros.append(reg)

    if registros:
        try:
            r = requests.post(f"{URL}/rest/v1/rpc/bulk_upsert_clientes", headers=h, json={'registros':registros}, timeout=30)
            if r.ok:
                d = r.json()
                ins_total += d.get('insertados',0)
                upd_total += d.get('actualizados',0)
            else:
                err_total += len(registros)
        except:
            err_total += len(registros)

    uploaded += len(chunk_df)
    if uploaded % 5000 < 200:
        pct = round(uploaded / written * 100) if written > 0 else 0
        print(f"\r  📤 {uploaded:,}/{written:,} ({pct}%) — {ins_total:,} nuevos, {upd_total:,} act", end="", flush=True)

elapsed = time.time() - t0
print(f"\n\n{'='*60}")
print(f"✅ PASO 2 COMPLETADO en {elapsed/60:.1f} min")
print(f"{'='*60}")
print(f"  CSV final: {FINAL_CSV} ({final_size:.1f} MB)")
print(f"  Filas únicas: {written:,}")
print(f"  Supabase: {ins_total:,} nuevos, {upd_total:,} actualizados, {err_total:,} errores")
print("="*60)
