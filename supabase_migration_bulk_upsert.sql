CREATE OR REPLACE FUNCTION bulk_upsert_clientes(registros JSONB)
RETURNS JSONB AS $$
DECLARE
  rec JSONB;
  insertados INT := 0;
  actualizados INT := 0;
  errores_count INT := 0;
  v_cups TEXT;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(registros)
  LOOP
    v_cups := rec->>'cups';

    IF v_cups IS NOT NULL AND v_cups != '' THEN
      BEGIN
        INSERT INTO clientes (
          cups, dni, nombre, direccion, campana,
          fecha_alta, fecha_baja, fecha_activacion,
          fecha_ultimo_cambio, estado, oficina_id, datos_extra
        )
        VALUES (
          v_cups,
          rec->>'dni',
          rec->>'nombre',
          rec->>'direccion',
          rec->>'campana',
          (NULLIF(rec->>'fecha_alta', ''))::date,
          (NULLIF(rec->>'fecha_baja', ''))::date,
          (NULLIF(rec->>'fecha_activacion', ''))::date,
          (NULLIF(rec->>'fecha_ultimo_cambio', ''))::date,
          rec->>'estado',
          (NULLIF(rec->>'oficina_id', ''))::uuid,
          CASE WHEN rec->'datos_extra' IS NOT NULL AND rec->>'datos_extra' != 'null'
               THEN rec->'datos_extra' ELSE NULL END
        )
        ON CONFLICT (cups) DO UPDATE SET
          dni = COALESCE(EXCLUDED.dni, clientes.dni),
          nombre = COALESCE(EXCLUDED.nombre, clientes.nombre),
          direccion = COALESCE(EXCLUDED.direccion, clientes.direccion),
          campana = COALESCE(EXCLUDED.campana, clientes.campana),
          estado = COALESCE(EXCLUDED.estado, clientes.estado),
          datos_extra = CASE
            WHEN clientes.datos_extra IS NULL THEN EXCLUDED.datos_extra
            WHEN EXCLUDED.datos_extra IS NULL THEN clientes.datos_extra
            ELSE clientes.datos_extra || EXCLUDED.datos_extra
          END,
          updated_at = now();

        insertados := insertados + 1;
      EXCEPTION WHEN OTHERS THEN
        errores_count := errores_count + 1;
      END;
    ELSE
      BEGIN
        INSERT INTO clientes (
          dni, nombre, direccion, campana, estado,
          oficina_id, datos_extra
        )
        VALUES (
          rec->>'dni', rec->>'nombre', rec->>'direccion',
          rec->>'campana', rec->>'estado',
          (NULLIF(rec->>'oficina_id', ''))::uuid,
          CASE WHEN rec->'datos_extra' IS NOT NULL AND rec->>'datos_extra' != 'null'
               THEN rec->'datos_extra' ELSE NULL END
        );
        insertados := insertados + 1;
      EXCEPTION WHEN OTHERS THEN
        errores_count := errores_count + 1;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'insertados', insertados,
    'actualizados', actualizados,
    'errores', errores_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout = '300s';

GRANT EXECUTE ON FUNCTION bulk_upsert_clientes(JSONB) TO service_role;
