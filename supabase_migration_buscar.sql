-- Unified search: dni, cups, nombre, and datos_extra (phones, email, etc.)
CREATE OR REPLACE FUNCTION buscar_clientes(termino TEXT)
RETURNS SETOF clientes AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM clientes WHERE
    dni ILIKE '%' || termino || '%' OR
    cups ILIKE '%' || termino || '%' OR
    nombre ILIKE '%' || termino || '%' OR
    datos_extra::text ILIKE '%' || termino || '%'
  LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
