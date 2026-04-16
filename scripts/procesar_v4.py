#!/usr/bin/env python3
"""FINDY — v4: secuencial pero con to_dict en vez de iterrows (10x más rápido)"""
import pandas as pd, os, glob, requests, re, time, sys, warnings
warnings.filterwarnings('ignore')

env = open('/Users/john/PROYECTOS_ANTIGRAVITY/findy-buscador/.env').read()
API_KEY = re.search(r'VITE_SUPABASE_ANON_KEY=(.+)', env).group(1).strip()
URL = "https://gqvkrlacbvuhfbjqltqp.supabase.co"
EXCL_NAME = ['liquidacion','nomina','factura','pago','euros','comision','~$','plantilla']
EXCL_COL = ['importe','precio','coste','euros','€','$','factura','liquidacion','comision','pago','saldo','total','iva','impuesto']

def limpiar(v):
    if pd.isna(v): return None
    s = str(v).strip()
    if not s or s.lower() in ('nan','none','null'): return None
    s = re.sub(r'<[^>]+>','',s)
    s = re.sub(r'^(NIF|NIE|DNI|CIF)\s*:?\s*','',s,flags=re.I)
    s = re.sub(r'Persona\s+\w+.*$','',s,flags=re.I).strip()
    s = re.sub(r'\.0$','',s)
    if s.startswith('+34') and len(s)>=12: s=s[3:]
    elif re.match(r'^34[6789]',s) and len(s)>=11: s=s[2:]
    return s.strip() or None

def campo(col):
    c=col.lower().replace(' ','').replace('_','')
    if 'cups' in c: return 'cups'
    if any(x in c for x in ['dni','nif','nie']): return 'dni'
    if any(x in c for x in ['nombre','titular']): return 'nombre'
    if any(x in c for x in ['direccion','calle','domicilio']): return 'direccion'
    if 'campan' in c or 'comercializador' in c: return 'campana'
    if 'estado' in c or 'status' in c: return 'estado'
    return None

def col_ok(c):
    cl=c.lower()
    return not any(x in cl for x in EXCL_COL)

def procesar(path):
    try:
        eng='openpyxl' if path.endswith('.xlsx') else 'xlrd'
        df=pd.read_excel(path,nrows=50000,dtype=str,engine=eng)
    except: return []
    cols=[c for c in df.columns if col_ok(str(c))]
    if not cols: return []
    # Check relevance
    campos_map={c:campo(str(c)) for c in cols}
    if not any(v in ('cups','dni','nombre') for v in campos_map.values()): return []

    BD={'cups','dni','nombre','direccion','campana','estado'}
    regs=[]
    # to_dict is 10-50x faster than iterrows
    for row in df[cols].to_dict('records'):
        r={'datos_extra':{}}
        for c,v in row.items():
            val=limpiar(v)
            if not val: continue
            cm=campos_map.get(c)
            if cm and cm in BD: r[cm]=val
            else: r['datos_extra'][str(c)]=val
        if not r['datos_extra']: r['datos_extra']=None
        if r.get('cups') or r.get('dni') or r.get('nombre'): regs.append(r)
    return regs

def cargar(registros):
    h={'Content-Type':'application/json','apikey':API_KEY,'Authorization':f'Bearer {API_KEY}','Prefer':'return=representation'}
    ins=upd=0
    total=len(registros)
    for i in range(0,total,200):
        chunk=registros[i:i+200]
        try:
            r=requests.post(f"{URL}/rest/v1/rpc/bulk_upsert_clientes",headers=h,json={'registros':chunk},timeout=30)
            if r.ok:
                d=r.json(); ins+=d.get('insertados',0); upd+=d.get('actualizados',0)
            pct=round((i+len(chunk))/total*100)
            sys.stdout.write(f"\r  📤 {i+len(chunk):,}/{total:,} ({pct}%) — {ins:,} nuevos, {upd:,} act")
            sys.stdout.flush()
        except: pass
        time.sleep(0.05)
    print()
    return ins,upd

t0=time.time()
print("="*60)
print("FINDY — Procesador v4 (to_dict, secuencial)")
print("="*60)

# Scan
rutas=set()
for b in [os.path.expanduser(d) for d in ['~/Desktop','~/Downloads','~/Documents','~/PROYECTOS_ANTIGRAVITY']]:
    if os.path.exists(b):
        for ext in ['**/*.xlsx','**/*.xls']:
            rutas.update(glob.glob(os.path.join(b,ext),recursive=True))
rutas=sorted([r for r in rutas if not os.path.basename(r).startswith('~') and not os.path.basename(r).startswith('.')])
rutas=[r for r in rutas if not any(x in os.path.basename(r).lower() for x in EXCL_NAME)]
print(f"\n📂 {len(rutas)} archivos")

# Process
todos=[]
validos=0
for i,path in enumerate(rutas):
    regs=procesar(path)
    if regs:
        validos+=1
        todos.extend(regs)
    if (i+1)%10==0 or regs:
        sys.stdout.write(f"\r  [{i+1}/{len(rutas)}] {validos} válidos, {len(todos):,} registros")
        sys.stdout.flush()
print(f"\n\n  ✅ {validos} archivos → {len(todos):,} registros")

# Dedup
print(f"\n🔄 Deduplicando...")
cups_best={}; sin_cups=[]
for r in todos:
    c=(r.get('cups') or '').strip()
    if not c: sin_cups.append(r); continue
    if c not in cups_best: cups_best[c]=r
    else:
        n1=len([v for v in r.values() if v])+len([v for v in (r.get('datos_extra') or {}).values() if v])
        n2=len([v for v in cups_best[c].values() if v])+len([v for v in (cups_best[c].get('datos_extra') or {}).values() if v])
        if n1>n2: cups_best[c]=r
final=list(cups_best.values())+sin_cups
print(f"  {len(final):,} únicos (eliminados: {len(todos)-len(final):,})")

# Save
print(f"\n💾 Guardando...")
os.makedirs(os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL'),exist_ok=True)
try:
    df=pd.DataFrame(final)
    if 'datos_extra' in df.columns:
        ex=df['datos_extra'].apply(lambda x:x if isinstance(x,dict) else {})
        df=pd.concat([df.drop(columns=['datos_extra']),pd.json_normalize(ex)],axis=1)
    df.to_csv(os.path.expanduser('~/Desktop/PROYECTO_FINDY_BASE_DATOS_TOTAL/base_completa.csv'),index=False)
    print(f"  ✅ base_completa.csv ({len(df):,} filas)")
except Exception as e:
    print(f"  ❌ {e}")

# Upload
print(f"\n🚀 Cargando {len(final):,} a Supabase...")
ins,upd=cargar(final)

el=time.time()-t0
print(f"\n{'='*60}")
print(f"✅ COMPLETADO en {el/60:.1f} min")
print(f"  {validos} archivos, {len(todos):,}→{len(final):,} únicos")
print(f"  Supabase: {ins:,} nuevos, {upd:,} actualizados")
print("="*60)
