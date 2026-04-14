CREATE TABLE IF NOT EXISTS intentos_acceso_bloqueado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID,
  usuario_email TEXT,
  usuario_nombre TEXT,
  oficina TEXT,
  ip_intentada TEXT,
  ciudad TEXT,
  pais TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE intentos_acceso_bloqueado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso intentos" ON intentos_acceso_bloqueado
  FOR ALL USING (true) WITH CHECK (true);
