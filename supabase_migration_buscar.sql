-- Index for text search on datos_extra
CREATE INDEX IF NOT EXISTS idx_clientes_datos_extra_text
ON clientes USING gin (to_tsvector('simple', coalesce(datos_extra::text, '')));

-- Optimized search: fast fields first, datos_extra only if needed
CREATE OR REPLACE FUNCTION buscar_clientes_admin(termino TEXT)
RETURNS SETOF clientes AS $$
DECLARE
  resultado clientes;
  encontrados INT;
BEGIN
  -- First: search indexed fields (fast)
  RETURN QUERY
  SELECT * FROM clientes WHERE
    dni ILIKE '%' || termino || '%' OR
    cups ILIKE '%' || termino || '%' OR
    nombre ILIKE '%' || termino || '%'
  LIMIT 20;

  GET DIAGNOSTICS encontrados = ROW_COUNT;

  -- If no results from main fields, search datos_extra (slower)
  IF encontrados = 0 THEN
    RETURN QUERY
    SELECT * FROM clientes WHERE
      datos_extra::text ILIKE '%' || termino || '%'
    LIMIT 20;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION buscar_clientes_admin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION buscar_clientes_admin(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION buscar_clientes_admin(TEXT) TO service_role;
