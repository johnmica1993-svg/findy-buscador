-- Drop old versions
DROP FUNCTION IF EXISTS buscar_clientes(TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS buscar_clientes(TEXT);

-- Unified search with specific JSONB key lookups for phones
CREATE OR REPLACE FUNCTION buscar_clientes(termino TEXT)
RETURNS SETOF clientes AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM clientes WHERE
    dni ILIKE '%' || termino || '%' OR
    cups ILIKE '%' || termino || '%' OR
    nombre ILIKE '%' || termino || '%' OR
    datos_extra::text ILIKE '%' || termino || '%' OR
    datos_extra->>'Telefono1' ILIKE '%' || termino || '%' OR
    datos_extra->>'Telefono2' ILIKE '%' || termino || '%' OR
    datos_extra->>'telefono1' ILIKE '%' || termino || '%' OR
    datos_extra->>'telefono2' ILIKE '%' || termino || '%' OR
    datos_extra->>'TELEFON 1' ILIKE '%' || termino || '%' OR
    datos_extra->>'TELEFON 2' ILIKE '%' || termino || '%' OR
    datos_extra->>'Teléfono' ILIKE '%' || termino || '%' OR
    datos_extra->>'Movil' ILIKE '%' || termino || '%' OR
    datos_extra->>'movil' ILIKE '%' || termino || '%' OR
    datos_extra->>'email' ILIKE '%' || termino || '%' OR
    datos_extra->>'Email' ILIKE '%' || termino || '%' OR
    datos_extra->>'IBAN' ILIKE '%' || termino || '%'
  LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION buscar_clientes(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION buscar_clientes(TEXT) TO anon;
