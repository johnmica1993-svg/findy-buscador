CREATE TABLE IF NOT EXISTS busquedas_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID REFERENCES usuarios(id),
  usuario_nombre TEXT,
  termino_busqueda TEXT,
  resultado_encontrado BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE busquedas_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ve todos los logs" ON busquedas_log
  FOR SELECT USING (get_user_rol() = 'ADMIN');

CREATE POLICY "Usuarios insertan sus logs" ON busquedas_log
  FOR INSERT WITH CHECK (true);
