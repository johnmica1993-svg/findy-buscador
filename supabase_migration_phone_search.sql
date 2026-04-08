-- Function to search clients by phone number in datos_extra JSONB
CREATE OR REPLACE FUNCTION search_by_phone(phone_term TEXT)
RETURNS SETOF clientes AS $$
  SELECT * FROM clientes
  WHERE
    datos_extra::text ILIKE '%' || phone_term || '%'
  LIMIT 20;
$$ LANGUAGE sql STABLE;
