-- Migration: Add ip_autorizada column to oficinas
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS ip_autorizada TEXT;

-- Migration: Add datos_extra JSONB column to clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS datos_extra JSONB;

-- Migration: Remove strict estado constraint (allow any value from Excel)
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_estado_check;
