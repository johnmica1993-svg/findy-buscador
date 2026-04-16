#!/usr/bin/env python3
"""PASO 3: Cargar CSV deduplicado a Supabase — 10 workers × 500 registros"""
import pandas as pd, os, time, sys, json, re, requests
from concurrent.futures import ThreadPoolExecutor, as_completed

FINAL_CSV = os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL/base_datos_completa.csv')
env = open('/Users/john/PROYECTOS_ANTIGRAVITY/findy-buscador/.env').read()
API_KEY = re.search(r'VITE_SUPABASE_ANON_KEY=(.+)', env).group(1).strip()
URL = "https://gqvkrlacbvuhfbjqltqp.supabase.co"

CHUNK = 500
WORKERS = 10
BD_COLS = {'cups','dni','nombre','direccion','campana','estado'}

def cargar_chunk(registros):
    try:
        r = requests.post(
            f"{URL}/rest/v1/rpc/bulk_upsert_clientes",
            headers={'Content-Type':'application/json','apikey':API_KEY,'Authorization':f'Bearer {API_KEY}','Prefer':'return=representation'},
            json={'registros': registros}, timeout=60
        )
        if r.ok:
            d = r.json()
            return d.get('insertados',0), d.get('actualizados',0), 0
        else:
            return 0, 0, len(registros)
    except:
        return 0, 0, len(registros)

def df_to_registros(chunk_df):
    registros = []
    for _, row in chunk_df.iterrows():
        reg = {}
        for col in BD_COLS:
            v = row.get(col, '').strip() if isinstance(row.get(col,''), str) else ''
            if v: reg[col] = v
        extra = row.get('datos_extra', '').strip() if isinstance(row.get('datos_extra',''), str) else ''
        if extra:
            try: reg['datos_extra'] = json.loads(extra)
            except: reg['datos_extra'] = None
        else:
            reg['datos_extra'] = None
        if reg.get('cups') or reg.get('dni') or reg.get('nombre'):
            registros.append(reg)
    return registros

t0 = time.time()
print("="*60)
print(f"PASO 3: Cargar a Supabase ({WORKERS} workers × {CHUNK} registros)")
print("="*60)

# Count
total = sum(1 for _ in open(FINAL_CSV, encoding='utf-8')) - 1
print(f"\n📊 {total:,} filas en CSV")
print(f"📤 Cargando...\n")

ins_total = upd_total = err_total = 0
enviados = 0

# Read CSV in chunks and dispatch to thread pool
with ThreadPoolExecutor(max_workers=WORKERS) as executor:
    futuros = {}

    for chunk_df in pd.read_csv(FINAL_CSV, chunksize=CHUNK, dtype=str, keep_default_na=False):
        registros = df_to_registros(chunk_df)
        if registros:
            futuro = executor.submit(cargar_chunk, registros)
            futuros[futuro] = len(registros)

        # Collect completed futures periodically
        done = [f for f in futuros if f.done()]
        for f in done:
            ins, upd, err = f.result()
            ins_total += ins
            upd_total += upd
            err_total += err
            enviados += futuros.pop(f)

        if enviados % 10000 < CHUNK:
            elapsed = time.time() - t0
            rate = enviados / elapsed if elapsed > 0 else 0
            eta = (total - enviados) / rate / 60 if rate > 0 else 0
            print(f"  📤 {enviados:,}/{total:,} ({round(enviados/total*100)}%) — {ins_total:,} nuevos, {upd_total:,} act, {err_total:,} err | {rate:.0f} reg/s | ETA: {eta:.0f} min")

    # Wait for remaining futures
    for f in as_completed(futuros):
        ins, upd, err = f.result()
        ins_total += ins
        upd_total += upd
        err_total += err
        enviados += futuros[f]

elapsed = time.time() - t0
print(f"\n{'='*60}")
print(f"✅ COMPLETADO en {elapsed/60:.1f} min")
print(f"{'='*60}")
print(f"  Total enviados: {enviados:,}")
print(f"  Insertados: {ins_total:,}")
print(f"  Actualizados: {upd_total:,}")
print(f"  Errores: {err_total:,}")
print(f"  Velocidad: {enviados/elapsed:.0f} reg/s")
print("="*60)
