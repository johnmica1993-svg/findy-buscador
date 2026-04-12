DROP FUNCTION IF EXISTS bulk_upsert_clientes(JSONB);

CREATE OR REPLACE FUNCTION bulk_upsert_clientes(registros JSONB)
RETURNS JSONB AS $$
  WITH input AS (
    SELECT
      nullif(trim(r->>'cups'), '')        AS cups,
      r->>'dni'                            AS dni,
      r->>'nombre'                         AS nombre,
      r->>'direccion'                      AS direccion,
      r->>'campana'                        AS campana,
      r->>'estado'                         AS estado,
      nullif(r->>'oficina_id','')::uuid    AS oficina_id,
      COALESCE(r->'datos_extra', '{}'::jsonb) AS datos_extra
    FROM jsonb_array_elements(registros) AS r
  ),
  upserted AS (
    INSERT INTO clientes(cups, dni, nombre, direccion, campana, estado, oficina_id, datos_extra)
    SELECT cups, dni, nombre, direccion, campana, estado, oficina_id, datos_extra
    FROM input
    WHERE cups IS NOT NULL
    ON CONFLICT (cups) DO UPDATE SET
      dni        = COALESCE(NULLIF(EXCLUDED.dni,''),        clientes.dni),
      nombre     = COALESCE(NULLIF(EXCLUDED.nombre,''),     clientes.nombre),
      direccion  = COALESCE(NULLIF(EXCLUDED.direccion,''),  clientes.direccion),
      campana    = COALESCE(NULLIF(EXCLUDED.campana,''),    clientes.campana),
      estado     = COALESCE(NULLIF(EXCLUDED.estado,''),     clientes.estado),
      datos_extra = clientes.datos_extra || EXCLUDED.datos_extra
    RETURNING (xmax = 0) AS es_insert
  ),
  sin_cups_ins AS (
    INSERT INTO clientes(dni, nombre, direccion, campana, estado, oficina_id, datos_extra)
    SELECT dni, nombre, direccion, campana, estado, oficina_id, datos_extra
    FROM input WHERE cups IS NULL
    RETURNING 1
  )
  SELECT jsonb_build_object(
    'insertados',   (SELECT COUNT(*) FROM upserted WHERE es_insert)
                  + (SELECT COUNT(*) FROM sin_cups_ins),
    'actualizados', (SELECT COUNT(*) FROM upserted WHERE NOT es_insert)
  );
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION bulk_upsert_clientes(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION bulk_upsert_clientes(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_upsert_clientes(JSONB) TO service_role;
