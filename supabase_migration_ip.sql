-- Migration: Add ip_autorizada column to oficinas
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS ip_autorizada TEXT;
