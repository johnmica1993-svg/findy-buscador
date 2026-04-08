-- Drop old function if exists
DROP FUNCTION IF EXISTS search_by_phone(TEXT);

-- Unified search function: searches cups, dni, nombre, and datos_extra (for phones)
CREATE OR REPLACE FUNCTION buscar_clientes(termino TEXT, termino_tel TEXT, lim INT DEFAULT 20)
RETURNS SETOF clientes AS $$
  SELECT DISTINCT ON (id) * FROM clientes
  WHERE
    dni ILIKE '%' || termino || '%'
    OR cups ILIKE '%' || termino || '%'
    OR nombre ILIKE '%' || termino || '%'
    OR (
      length(termino_tel) >= 6
      AND datos_extra::text ILIKE '%' || termino_tel || '%'
    )
  ORDER BY id
  LIMIT lim;
$$ LANGUAGE sql STABLE;
