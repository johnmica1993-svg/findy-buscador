-- Drop existing table if schema changed
DROP TABLE IF EXISTS busquedas_log;

CREATE TABLE busquedas_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  usuario_nombre TEXT,
  usuario_email TEXT,
  oficina TEXT,
  termino_busqueda TEXT,
  resultado_encontrado BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE busquedas_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ve todos los logs" ON busquedas_log
  FOR SELECT USING (get_user_rol() = 'ADMIN');

CREATE POLICY "Usuarios insertan sus logs" ON busquedas_log
  FOR INSERT WITH CHECK (true);
