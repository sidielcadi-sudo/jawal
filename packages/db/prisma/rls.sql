-- ─────────────────────────────────────────────────────────────
-- Jawal — Setup post-migration : rôle applicatif + RLS
-- À exécuter après `prisma migrate deploy` :
--   psql "$DATABASE_URL" -f packages/db/prisma/rls.sql
-- ─────────────────────────────────────────────────────────────

-- Extensions (idempotent — déjà créées par l'init Docker)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ─── Rôle applicatif (RLS active) ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jawal_app') THEN
    CREATE ROLE jawal_app LOGIN PASSWORD 'jawal_app';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO jawal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jawal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jawal_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jawal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO jawal_app;

-- ─── Helper : récupérer le tenant courant depuis la session ─
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;

-- ─── Activer RLS + politiques d'isolation ───────────────────
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
    'files',
    'attendance_sessions',
    'attendance_records',
    'absence_justifications',
    'subjects',
    'evaluations',
    'grades',
    'subject_appreciations',
    'council_entries',
    'announcements',
    'conversations',
    'conversation_participants',
    'messages',
    'fee_schedules',
    'installments',
    'payments',
    'person_roles',
    'person_relations',
    'teacher_assignments',
    'curriculum_subjects'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_scoped
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id IS NULL OR tenant_id = current_tenant_id())
        WITH CHECK (tenant_id IS NULL OR tenant_id = current_tenant_id())
    $p$, t);
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
