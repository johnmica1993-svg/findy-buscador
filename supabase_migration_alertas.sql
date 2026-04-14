CREATE TABLE IF NOT EXISTS alertas_admin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT DEFAULT 'ip_bloqueada',
  usuario_id UUID,
  usuario_nombre TEXT,
  usuario_email TEXT,
  oficina TEXT,
  ip TEXT,
  ciudad TEXT,
  pais TEXT,
  leida BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE alertas_admin ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gestiona alertas" ON alertas_admin
  FOR ALL USING (true) WITH CHECK (true);
