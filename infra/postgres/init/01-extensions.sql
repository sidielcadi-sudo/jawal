-- Extensions PostgreSQL nécessaires à Jawal.
-- Exécuté automatiquement par l'image postgres au premier démarrage.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
