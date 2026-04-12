CREATE TABLE IF NOT EXISTS carga_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES usuarios(id),
  estado TEXT DEFAULT 'pendiente',
  total_registros INT DEFAULT 0,
  procesados INT DEFAULT 0,
  insertados INT DEFAULT 0,
  actualizados INT DEFAULT 0,
  errores INT DEFAULT 0,
  nombre_archivo TEXT,
  error_mensaje TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE carga_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos gestionan jobs" ON carga_jobs
  USING (true) WITH CHECK (true);
