-- 1. Índice full-text para búsqueda por nombre
CREATE INDEX IF NOT EXISTS idx_clientes_nombre_fts
ON clientes USING gin(to_tsvector('spanish', coalesce(nombre, '')));

-- 2. Campos para estado contratable
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS estado_contratable BOOLEAN DEFAULT true;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS motivo_bloqueo TEXT;

-- 3. Índice en estado_contratable para filtrado rápido
CREATE INDEX IF NOT EXISTS idx_clientes_contratable ON clientes(estado_contratable) WHERE estado_contratable = false;
