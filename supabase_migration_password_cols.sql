ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultima_password_temporal TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_generada_at TIMESTAMPTZ;
