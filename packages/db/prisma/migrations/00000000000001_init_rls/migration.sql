-- ─────────────────────────────────────────────────────────────
-- Jawal — Activation Row-Level Security et rôle applicatif
-- À appliquer après la première migration générée par Prisma
-- (cette migration prépare les rôles ; les ALTER TABLE ... ENABLE RLS
--  seront ajoutés par une migration suivante une fois les tables créées)
-- ─────────────────────────────────────────────────────────────

-- Extension UUID (utilisée par @default(uuid()))
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Rôle applicatif (RLS active) — utilisé par la connexion DATABASE_URL_APP.
-- Le rôle propriétaire (migrations) reste superuser et bypass la RLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jawal_app') THEN
    CREATE ROLE jawal_app LOGIN PASSWORD 'jawal_app';
  END IF;
END
$$;

-- Le rôle applicatif doit pouvoir lire/écrire sur le schéma public
GRANT USAGE ON SCHEMA public TO jawal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jawal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jawal_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jawal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO jawal_app;
