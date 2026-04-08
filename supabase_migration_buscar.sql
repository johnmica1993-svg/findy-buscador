-- Unified search: cups, dni, nombre, and phone in datos_extra
CREATE OR REPLACE FUNCTION buscar_clientes(termino TEXT, termino_tel TEXT, lim INT DEFAULT 20)
RETURNS SETOF clientes AS $$
  SELECT DISTINCT ON (id) * FROM clientes
  WHERE
    dni ILIKE '%' || termino || '%'
    OR cups ILIKE '%' || termino || '%'
    OR nombre ILIKE '%' || termino || '%'
    OR (
      length(termino_tel) >= 6
      AND (
        datos_extra->>'telefono1' ILIKE '%' || termino_tel || '%'
        OR datos_extra->>'telefono2' ILIKE '%' || termino_tel || '%'
        OR datos_extra->>'Telefono1' ILIKE '%' || termino_tel || '%'
        OR datos_extra->>'Telefono2' ILIKE '%' || termino_tel || '%'
        OR datos_extra->>'TELEFON 1' ILIKE '%' || termino_tel || '%'
        OR datos_extra->>'TELEFON 2' ILIKE '%' || termino_tel || '%'
        OR datos_extra->>'Teléfono' ILIKE '%' || termino_tel || '%'
        OR datos_extra->>'Movil' ILIKE '%' || termino_tel || '%'
        OR datos_extra->>'movil' ILIKE '%' || termino_tel || '%'
        OR datos_extra::text ILIKE '%' || termino_tel || '%'
      )
    )
  ORDER BY id
  LIMIT lim;
$$ LANGUAGE sql STABLE;
