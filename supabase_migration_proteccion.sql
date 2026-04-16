-- Función rápida para contar clientes (evita timeout del count=exact)
CREATE OR REPLACE FUNCTION contar_clientes()
RETURNS BIGINT AS $$
  SELECT reltuples::BIGINT FROM pg_class WHERE relname = 'clientes';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION contar_clientes() TO anon, authenticated, service_role;

-- Proteger contra DELETE masivo
CREATE OR REPLACE RULE no_delete_clientes AS ON DELETE TO clientes DO INSTEAD NOTHING;

-- Verificar RLS activo
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'clientes';
