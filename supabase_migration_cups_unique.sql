-- Restore UNIQUE constraint on cups
ALTER TABLE clientes ADD CONSTRAINT clientes_cups_key UNIQUE (cups);
