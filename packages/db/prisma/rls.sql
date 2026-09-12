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
    'password_reset_tokens',
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
    'attendance_reasons',
    'attendance_events',
    'absence_justifications',
    'carnet_entries',
    'subjects',
    'evaluations',
    'grades',
    'subject_appreciations',
    'council_entries',
    'announcements',
    'surveys',
    'survey_questions',
    'survey_responses',
    'survey_answers',
    'conversations',
    'conversation_participants',
    'messages',
    'fee_schedules',
    'discount_rules',
    'appel_reminders',
    'installments',
    'payments',
    'person_roles',
    'services',
    'person_relations',
    'teacher_assignments',
    'curriculum_subjects',
    'teacher_specialties',
    'teacher_cycles',
    'teacher_priority_classes',
    'diplomas',
    'staff_attendance',
    'enrollments',
    'admission_quotas',
    'required_documents',
    'enrollment_documents',
    'timetable_slots',
    'timetable_entries',
    'timetable_overrides',
    'timetable_constraints',
    'lesson_entries',
    'homeworks',
    'lesson_resources',
    'exceptional_fee_types',
    'exceptional_fees',
    'exceptional_fee_assignments',
    'expenses',
    'payment_reminders',
    'transport_zones',
    'buses',
    'transport_lines',
    'transport_stops',
    'student_transports',
    'transport_attendance_sessions',
    'transport_attendance_records',
    'notification_logs',
    'leave_types',
    'leave_requests',
    'overtime_entries',
    'payroll_configs',
    'employee_payroll_profiles',
    'payroll_runs',
    'payslips',
    'book_exchange_configs',
    'book_exchange_campaigns',
    'books',
    'book_copies',
    'book_transactions',
    'fiscal_years',
    'accounts',
    'journal_entries',
    'journal_lines',
    'suppliers',
    'supplier_invoices',
    'supplier_payments',
    'radiation_requests',
    'radiation_refunds',
    'online_payments',
    'device_tokens',
    'staff_alerts',
    'support_courses',
    'support_slots',
    'support_enrollments',
    'support_sessions',
    'support_attendance',
    'support_resources',
    'competency_frameworks',
    'competency_nodes',
    'competency_node_levels',
    'mastery_levels',
    'competency_assessments',
    'competency_reports',
    'support_session_skills',
    'tracks',
    'track_subject_coefficients',
    'grading_rules',
    'exam_sessions',
    'exam_session_tracks',
    'exam_papers',
    'exam_room_allocations',
    'exam_supervisors',
    'exam_seats',
    'exam_graders',
    'exam_marks',
    'exam_blueprints',
    'exam_paper_tracks',
    'class_groups',
    'class_group_members',
    'class_group_slots'
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

-- ─────────────────────────────────────────────────────────────────────────
-- Unicité d'une case d'emploi du temps, avec dédoublement en groupes.
--
-- Deux index PARTIELS plutôt qu'une contrainte unique incluant group_id :
-- en SQL, NULL n'entre pas en conflit avec NULL, donc un UNIQUE(..., group_id)
-- laisserait passer deux séances « classe entière » sur la même case — le
-- doublon que l'ancienne contrainte interdisait justement.
--
--   1. classe entière : au plus une séance sans groupe par case ;
--   2. par groupe     : au plus une séance par (case × groupe).
--
-- Ensemble, ils autorisent N séances simultanées sur une même case dès qu'elles
-- visent des groupes distincts, et une seule si elle vise la classe entière.
-- Ils n'empêchent PAS de mêler une séance « classe entière » et une séance de
-- groupe sur la même case : c'est une incohérence pédagogique, pas une
-- violation d'intégrité, et elle est refusée côté serveur avec un message.
DROP INDEX IF EXISTS timetable_entries_whole_class_uniq;
CREATE UNIQUE INDEX timetable_entries_whole_class_uniq
  ON timetable_entries (class_id, academic_year_id, day_of_week, slot_id)
  WHERE group_id IS NULL;

DROP INDEX IF EXISTS timetable_entries_group_uniq;
CREATE UNIQUE INDEX timetable_entries_group_uniq
  ON timetable_entries (class_id, academic_year_id, day_of_week, slot_id, group_id)
  WHERE group_id IS NOT NULL;

-- Unicité d'une feuille d'appel, avec dédoublement en groupes.
-- Même construction que pour timetable_entries, et pour la même raison : en SQL
-- NULL n'entre pas en conflit avec NULL.
DROP INDEX IF EXISTS attendance_sessions_whole_class_uniq;
CREATE UNIQUE INDEX attendance_sessions_whole_class_uniq
  ON attendance_sessions (class_id, date, period_label)
  WHERE group_id IS NULL;

DROP INDEX IF EXISTS attendance_sessions_group_uniq;
CREATE UNIQUE INDEX attendance_sessions_group_uniq
  ON attendance_sessions (class_id, date, period_label, group_id)
  WHERE group_id IS NOT NULL;

-- Une salle ne peut accueillir qu'UNE séance à la fois.
--
-- Cette garantie n'existait pas : les conflits de salle étaient seulement
-- signalés à l'écran, jamais empêchés. Deux classes pouvaient donc être
-- inscrites dans la même salle au même créneau, et l'anomalie ne se
-- découvrait qu'en lisant le tableau de bord — ou devant la porte.
--
-- L'index ne porte que sur les séances AVEC salle : une case saisie sans salle
-- reste permise, c'est le cas courant d'un emploi du temps en cours de
-- construction.
DROP INDEX IF EXISTS timetable_entries_room_uniq;
CREATE UNIQUE INDEX timetable_entries_room_uniq
  ON timetable_entries (academic_year_id, day_of_week, slot_id, room_id)
  WHERE room_id IS NOT NULL;
