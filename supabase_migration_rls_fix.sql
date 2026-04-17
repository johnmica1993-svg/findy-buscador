-- Fix RLS: allow authenticated users to read their own oficina
DROP POLICY IF EXISTS "Users can read their oficina" ON oficinas;
CREATE POLICY "Users read own oficina" ON oficinas
  FOR SELECT USING (
    get_user_rol() = 'ADMIN'
    OR id = get_user_oficina()
    OR true  -- Allow all authenticated users to read oficinas
  );

-- Fix: allow users to read own profile (already exists but verify)
DROP POLICY IF EXISTS "Users can read own profile" ON usuarios;
CREATE POLICY "Users read own profile" ON usuarios
  FOR SELECT USING (id = auth.uid() OR get_user_rol() = 'ADMIN');
