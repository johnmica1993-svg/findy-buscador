#!/usr/bin/env python3
"""Carga lenta y segura: 1 worker, 100 reg, 5s pausa, reintentos infinitos"""
import pandas as pd, os, time, json, re, requests
from datetime import datetime

FINAL_CSV = os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL/base_datos_completa.csv')
RESUMEN = os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL/RESUMEN_FINAL.txt')
PROGRESO = os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL/progreso.txt')
env = open('/Users/john/PROYECTOS_ANTIGRAVITY/findy-buscador/.env').read()
API_KEY = re.search(r'VITE_SUPABASE_ANON_KEY=(.+)', env).group(1).strip()
URL = "https://gqvkrlacbvuhfbjqltqp.supabase.co"

SKIP = 290000
CHUNK = 100
PAUSA = 5
BD_COLS = {'cups','dni','nombre','direccion','campana','estado'}

def cargar(registros):
    """Reintentos infinitos con backoff exponencial"""
    espera = 5
    intento = 0
    while True:
        intento += 1
        try:
            r = requests.post(
                f"{URL}/rest/v1/rpc/bulk_upsert_clientes",
                headers={'Content-Type':'application/json','apikey':API_KEY,'Authorization':f'Bearer {API_KEY}','Prefer':'return=representation'},
                json={'registros': registros}, timeout=120
            )
            if r.ok:
                d = r.json()
                return d.get('insertados',0), d.get('actualizados',0), 0
            elif r.status_code in (500, 502, 503, 504):
                print(f"\n  ⏳ Supabase {r.status_code}, reintento {intento} en {espera}s...")
                time.sleep(espera)
                espera = min(espera * 2, 120)
                continue
            else:
                return 0, 0, len(registros)
        except requests.exceptions.Timeout:
            print(f"\n  ⏳ Timeout, reintento {intento} en {espera}s...")
            time.sleep(espera)
            espera = min(espera * 2, 120)
        except Exception as e:
            print(f"\n  ⏳ Error: {e}, reintento {intento} en {espera}s...")
            time.sleep(espera)
            espera = min(espera * 2, 120)

inicio = datetime.now()
t0 = time.time()
total = sum(1 for _ in open(FINAL_CSV, encoding='utf-8')) - 1
restantes = total - SKIP

print("="*60)
print(f"CARGA LENTA SEGURA: 1 worker × {CHUNK} reg × {PAUSA}s pausa")
print(f"Saltando {SKIP:,} | Restantes: {restantes:,}")
print(f"Reintentos: infinitos con backoff exponencial")
print("="*60)

ins_total = upd_total = err_total = 0
enviados = 0
fila = 0

for chunk_df in pd.read_csv(FINAL_CSV, chunksize=CHUNK, dtype=str, keep_default_na=False):
    fila += len(chunk_df)
    if fila <= SKIP:
        continue

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

    if registros:
        ins, upd, err = cargar(registros)
        ins_total += ins
        upd_total += upd
        err_total += err
        enviados += len(registros)

    if enviados % 1000 < CHUNK:
        elapsed = time.time() - t0
        rate = enviados / elapsed if elapsed > 0 else 0
        eta = (restantes - enviados) / rate / 60 if rate > 0 else 0
        status = f"📤 {enviados:,}/{restantes:,} ({round(enviados/restantes*100) if restantes else 0}%) — {ins_total:,} nuevos, {upd_total:,} act | {rate:.0f}/s | ETA: {eta:.0f}m"
        print(f"\r  {status}", end="", flush=True)
        # Save progress to file
        with open(PROGRESO, 'w') as f:
            f.write(f"{status}\nUltima actualizacion: {datetime.now()}\n")

    time.sleep(PAUSA)

fin = datetime.now()
elapsed = time.time() - t0
prev_ins, prev_upd = 201564, 81936

resumen = f"""{'='*60}
FINDY BUSCADOR — RESUMEN FINAL DE CARGA
{'='*60}
Inicio: {inicio}
Fin: {fin}
Duración: {elapsed/60:.1f} min

ARCHIVOS: 2,013 escaneados, 1,811 válidos
FILAS: 26,203,119 leídas → 7,325,747 únicas (72% duplicados)

SUPABASE:
  Nuevos: {prev_ins + ins_total:,}
  Actualizados: {prev_upd + upd_total:,}
  Errores: {err_total:,}

CSV: ~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL/base_datos_completa.csv (2.2 GB)
{'='*60}
"""
print(f"\n\n{resumen}")
with open(RESUMEN, 'w') as f:
    f.write(resumen)
