-- ============================================
-- Migration: Make clientes table flexible
-- ============================================

-- Remove NOT NULL from cups
ALTER TABLE clientes ALTER COLUMN cups DROP NOT NULL;

-- Remove UNIQUE constraint on cups
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_cups_key;

-- Remove CHECK constraints
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_campana_check;
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_estado_check;

-- Remove individual indexes that enforce uniqueness
DROP INDEX IF EXISTS clientes_cups_key;

-- Create partial unique index on (dni, cups) only when both are NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS clientes_dni_cups_unique
ON clientes (dni, cups)
WHERE dni IS NOT NULL AND cups IS NOT NULL;
