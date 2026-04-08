CREATE OR REPLACE FUNCTION buscar_clientes_admin(termino TEXT)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION buscar_clientes_admin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION buscar_clientes_admin(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION buscar_clientes_admin(TEXT) TO service_role;
