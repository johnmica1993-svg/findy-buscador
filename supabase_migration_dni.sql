-- Function to extract clean DNI/NIF from messy text
-- Finds patterns like 45758884Q, B12345678, X1234567A (8-10 alphanumeric chars)
CREATE OR REPLACE FUNCTION limpiar_dni(raw_text TEXT)
RETURNS TEXT AS $$
DECLARE
  resultado TEXT;
BEGIN
  IF raw_text IS NULL OR raw_text = '' THEN
    RETURN NULL;
  END IF;
  -- Extract first match of 8-10 alphanumeric characters (DNI/NIF/CIF pattern)
  SELECT (regexp_match(raw_text, '([A-Za-z]?\d{7,8}[A-Za-z]?)'))[1] INTO resultado;
  IF resultado IS NOT NULL THEN
    RETURN upper(resultado);
  END IF;
  -- Fallback: strip all non-alphanumeric, return if 8-10 chars
  resultado := upper(regexp_replace(raw_text, '[^A-Za-z0-9]', '', 'g'));
  IF length(resultado) BETWEEN 8 AND 10 THEN
    RETURN resultado;
  END IF;
  -- Last resort: return trimmed original
  RETURN trim(raw_text);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Mass update all existing records
UPDATE clientes SET dni = limpiar_dni(dni) WHERE dni IS NOT NULL;
