-- ─────────────────────────────────────────────────────────────
-- Jawal — Politiques Row-Level Security
-- À exécuter MANUELLEMENT après `prisma migrate dev` initial
-- (Prisma ne génère pas encore RLS automatiquement)
--
-- Usage : psql $DATABASE_URL -f packages/db/prisma/rls.sql
-- ─────────────────────────────────────────────────────────────

-- Helper : récupérer le tenant courant depuis la variable de session
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;

-- Macro : activer RLS + politique d'isolation tenant sur une table
-- (table doit avoir une colonne `tenant_id uuid`)
DO $$
DECLARE
  t text;
  tenant_scoped text[] := ARRAY[
    'tenant_modules',
    'users',
    'persons',
    'user_persons',
    'roles',
    'user_roles',
    'academic_years',
    'periods',
    'cycles',
    'levels',
    'classes',
    'student_classes',
    'rooms',
    'audit_logs',
    'files'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_scoped
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    -- Politique : un utilisateur ne voit que son tenant
    EXECUTE format($p$
      DROP POLICY IF EXISTS tenant_isolation ON %I;
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id IS NULL OR tenant_id = current_tenant_id())
        WITH CHECK (tenant_id IS NULL OR tenant_id = current_tenant_id());
    $p$, t, t);
  END LOOP;
END
$$;

-- Table `tenants` : isolation sur `id` plutôt que `tenant_id`
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON tenants;
CREATE POLICY tenant_self ON tenants
  USING (id = current_tenant_id())
  WITH CHECK (id = current_tenant_id());
