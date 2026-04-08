-- ============================================
-- FINDY BUSCADOR — Supabase Schema
-- ============================================

-- 1. OFICINAS
CREATE TABLE oficinas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  codigo TEXT UNIQUE NOT NULL,
  activa BOOLEAN DEFAULT true,
  ip_permitidas TEXT[] DEFAULT '{}',
  ip_autorizada TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. USUARIOS
CREATE TABLE usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('ADMIN', 'OFICINA', 'COMERCIAL')),
  oficina_id UUID REFERENCES oficinas(id) ON DELETE SET NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. CLIENTES
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cups TEXT UNIQUE NOT NULL,
  dni TEXT,
  nombre TEXT,
  direccion TEXT,
  campana TEXT CHECK (campana IN ('ENDESA', 'FACTOR_ENERGIA', 'NATURGY_RADEN', 'OTRO')),
  fecha_alta DATE,
  fecha_ultimo_cambio DATE,
  fecha_baja DATE,
  fecha_activacion DATE,
  estado TEXT DEFAULT 'PENDIENTE' CHECK (estado IN ('ACTIVO', 'BAJA', 'PENDIENTE', 'CANCELADO')),
  oficina_id UUID REFERENCES oficinas(id) ON DELETE SET NULL,
  created_by UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_clientes_cups ON clientes(cups);
CREATE INDEX idx_clientes_dni ON clientes(dni);
CREATE INDEX idx_clientes_nombre ON clientes(nombre);
CREATE INDEX idx_clientes_campana ON clientes(campana);
CREATE INDEX idx_clientes_estado ON clientes(estado);
CREATE INDEX idx_clientes_oficina ON clientes(oficina_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE oficinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION get_user_rol()
RETURNS TEXT AS $$
  SELECT rol FROM usuarios WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get current user's oficina
CREATE OR REPLACE FUNCTION get_user_oficina()
RETURNS UUID AS $$
  SELECT oficina_id FROM usuarios WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- OFICINAS policies
CREATE POLICY "Admin full access oficinas" ON oficinas
  FOR ALL USING (get_user_rol() = 'ADMIN');

CREATE POLICY "Users can read their oficina" ON oficinas
  FOR SELECT USING (id = get_user_oficina() OR get_user_rol() = 'ADMIN');

-- USUARIOS policies
CREATE POLICY "Admin full access usuarios" ON usuarios
  FOR ALL USING (get_user_rol() = 'ADMIN');

CREATE POLICY "Users can read own profile" ON usuarios
  FOR SELECT USING (id = auth.uid());

-- CLIENTES policies
CREATE POLICY "Admin full access clientes" ON clientes
  FOR ALL USING (get_user_rol() = 'ADMIN');

CREATE POLICY "Oficina access own clientes" ON clientes
  FOR ALL USING (
    get_user_rol() = 'OFICINA' AND oficina_id = get_user_oficina()
  );

CREATE POLICY "Comercial read clientes" ON clientes
  FOR SELECT USING (get_user_rol() = 'COMERCIAL');

-- ============================================
-- SEED: Default admin (run after creating auth user)
-- ============================================
-- INSERT INTO usuarios (id, nombre, email, rol)
-- VALUES ('<auth-user-uuid>', 'Administrador', 'admin@findy.com', 'ADMIN');
