#!/usr/bin/env python3
"""Continuar carga desde registro 290,000 — 5 workers × 500 registros"""
import pandas as pd, os, time, sys, json, re, requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

FINAL_CSV = os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL/base_datos_completa.csv')
RESUMEN = os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL/RESUMEN_FINAL.txt')
env = open('/Users/john/PROYECTOS_ANTIGRAVITY/findy-buscador/.env').read()
API_KEY = re.search(r'VITE_SUPABASE_ANON_KEY=(.+)', env).group(1).strip()
URL = "https://gqvkrlacbvuhfbjqltqp.supabase.co"

SKIP = 290000
CHUNK = 500
WORKERS = 5
MAX_RETRIES = 3
BD_COLS = {'cups','dni','nombre','direccion','campana','estado'}

def cargar_chunk(registros, intento=1):
    try:
        r = requests.post(
            f"{URL}/rest/v1/rpc/bulk_upsert_clientes",
            headers={'Content-Type':'application/json','apikey':API_KEY,'Authorization':f'Bearer {API_KEY}','Prefer':'return=representation'},
            json={'registros': registros}, timeout=60
        )
        if r.ok:
            d = r.json()
            return d.get('insertados',0), d.get('actualizados',0), 0
        elif intento < MAX_RETRIES:
            time.sleep(2 * intento)
            return cargar_chunk(registros, intento + 1)
        else:
            return 0, 0, len(registros)
    except:
        if intento < MAX_RETRIES:
            time.sleep(2 * intento)
            return cargar_chunk(registros, intento + 1)
        return 0, 0, len(registros)

def df_to_registros(chunk_df):
    registros = []
    for _, row in chunk_df.iterrows():
        reg = {}
        for col in BD_COLS:
            v = row.get(col, '')
            if isinstance(v, str) and v.strip():
                reg[col] = v.strip()
        extra = row.get('datos_extra', '')
        if isinstance(extra, str) and extra.strip():
            try: reg['datos_extra'] = json.loads(extra)
            except: reg['datos_extra'] = None
        else:
            reg['datos_extra'] = None
        if reg.get('cups') or reg.get('dni') or reg.get('nombre'):
            registros.append(reg)
    return registros

inicio = datetime.now()
t0 = time.time()
total = sum(1 for _ in open(FINAL_CSV, encoding='utf-8')) - 1
restantes = total - SKIP

print("="*60)
print(f"CARGA CONTINUA: {WORKERS} workers × {CHUNK} reg")
print(f"Saltando primeros {SKIP:,} (ya cargados)")
print(f"Restantes: {restantes:,} de {total:,}")
print("="*60)

ins_total = upd_total = err_total = 0
enviados = 0
fila = 0

with ThreadPoolExecutor(max_workers=WORKERS) as executor:
    futuros = {}
    for chunk_df in pd.read_csv(FINAL_CSV, chunksize=CHUNK, dtype=str, keep_default_na=False):
        fila += len(chunk_df)
        if fila <= SKIP:
            continue

        registros = df_to_registros(chunk_df)
        if registros:
            futuro = executor.submit(cargar_chunk, registros)
            futuros[futuro] = len(registros)

        # Limit pending futures to avoid memory buildup
        while len(futuros) >= WORKERS * 2:
            done = [f for f in futuros if f.done()]
            for f in done:
                ins, upd, err = f.result()
                ins_total += ins
                upd_total += upd
                err_total += err
                enviados += futuros.pop(f)
            if not done:
                time.sleep(0.5)

        if enviados % 10000 < CHUNK:
            elapsed = time.time() - t0
            rate = enviados / elapsed if elapsed > 0 else 0
            eta = (restantes - enviados) / rate / 60 if rate > 0 else 0
            print(f"  📤 {enviados:,}/{restantes:,} ({round(enviados/restantes*100) if restantes else 0}%) — {ins_total:,} nuevos, {upd_total:,} act, {err_total:,} err | {rate:.0f}/s | ETA: {eta:.0f}m")

    for f in as_completed(futuros):
        ins, upd, err = f.result()
        ins_total += ins
        upd_total += upd
        err_total += err
        enviados += futuros[f]

fin = datetime.now()
elapsed = time.time() - t0

# Totales incluyendo carga anterior
prev_ins = 201564
prev_upd = 81936

resumen = f"""{'='*60}
FINDY BUSCADOR — RESUMEN FINAL DE CARGA
{'='*60}

Inicio: {inicio.strftime('%Y-%m-%d %H:%M:%S')}
Fin: {fin.strftime('%Y-%m-%d %H:%M:%S')}
Duración carga: {elapsed/60:.1f} minutos

ARCHIVOS:
  Excel escaneados: 2,013
  Archivos válidos: 1,811
  Filas totales leídas: 26,203,119

DEDUPLICACIÓN:
  Filas únicas (por CUPS): 7,325,747
  Duplicados eliminados: 18,877,372 (72%)

CARGA A SUPABASE:
  Nuevos insertados: {prev_ins + ins_total:,}
  Actualizados: {prev_upd + upd_total:,}
  Errores: {err_total:,}
  Total en CRM: {prev_ins + ins_total + prev_upd + upd_total:,}

CSV guardado: ~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL/base_datos_completa.csv (2.2 GB)
{'='*60}
"""

print(resumen)
with open(RESUMEN, 'w') as f:
    f.write(resumen)
print(f"📝 Resumen guardado en {RESUMEN}")
