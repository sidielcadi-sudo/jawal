-- Force l'encodage client en UTF-8 (sinon Windows console = WIN1252 et
-- les caractères accentués/box-drawing cassent le parsing)
SET CLIENT_ENCODING TO 'UTF8';

-- ─────────────────────────────────────────────────────────────────────────
-- Seed grandeur nature : collège marocain complet pour tester /solve-multi
--
-- 3 niveaux (1AC, 2AC, 3AC) × 3 classes (A, B, C) = 9 classes
-- 30 élèves/classe = 270 élèves + 270 parents
-- 16 profs avec dispos 5j × 8h (dont 1 mi-temps matin)
-- 18 salles (9 standard + 4 labos + 5 spécialisées)
-- 10 matières × 3 niveaux = 30 lignes de programme
-- 9 classes × 10 matières = 90 affectations pédagogiques
--
-- Usage :
--   psql "postgres://jawal:jawal@localhost:5433/jawal" \
--     -f infra/postgres/seed-college-big.sql
--
-- Idempotent : tout est marqué metadata.big_seed=true ou nom préfixé BIG-
-- pour permettre un cleanup ciblé sans toucher au reste.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tenant_id           uuid;
  v_year_id             uuid;
  v_cycle_id            uuid;
  v_lvl_1ac             uuid;
  v_lvl_2ac             uuid;
  v_lvl_3ac             uuid;

  -- Subjects
  v_sub_math            uuid;
  v_sub_fr              uuid;
  v_sub_ar              uuid;
  v_sub_en              uuid;
  v_sub_hg              uuid;
  v_sub_svt             uuid;
  v_sub_pc              uuid;
  v_sub_eps             uuid;
  v_sub_ei              uuid;
  v_sub_info            uuid;

  -- Rooms (tableaux)
  v_room_std            uuid[];   -- 9 salles standard
  v_room_lab            uuid[];   -- 2 labos PC, 2 labos SVT
  v_room_info           uuid[];   -- 2 salles info
  v_room_eps            uuid;     -- 1 gymnase
  v_room_other          uuid[];   -- 2 salles supplémentaires
  v_room_id             uuid;

  -- Teachers (tableaux par matière)
  v_t_math              uuid[];
  v_t_fr                uuid[];
  v_t_ar                uuid[];
  v_t_en                uuid[];
  v_t_hg                uuid;
  v_t_svt               uuid;
  v_t_pc                uuid;
  v_t_eps               uuid[];
  v_t_ei                uuid;
  v_t_info              uuid;

  -- Classes
  v_classes             uuid[9];

  v_availability_full   jsonb;
  v_availability_morning jsonb;

  v_i                   int;
  v_j                   int;
  v_idx                 int;
  v_class_id            uuid;
  v_level_id            uuid;
  v_student_id          uuid;
  v_parent_id           uuid;
  v_label               text;
  v_first_names         text[] := ARRAY[
    'Yassine', 'Salma', 'Omar', 'Amina', 'Karim', 'Sara', 'Mehdi', 'Lina',
    'Hassan', 'Ikram', 'Anas', 'Hiba', 'Reda', 'Nada', 'Adam', 'Maryam',
    'Ayoub', 'Imane', 'Khalid', 'Soukaina', 'Younes', 'Wiam', 'Hamza',
    'Chaima', 'Bilal', 'Ghita', 'Achraf', 'Rania', 'Nizar', 'Rim'
  ];
  v_last_names          text[] := ARRAY[
    'Benani', 'Cherkaoui', 'Tazi', 'El Idrissi', 'Alaoui', 'Bennis',
    'Fassi', 'Berrada', 'Skalli', 'Sefrioui', 'Mansouri', 'Bouhassoun',
    'Lahcen', 'Ouazzani', 'El Amrani', 'Bennani', 'Lazrak', 'Filali'
  ];
BEGIN
  -- ─── 0. Tenant ─────────────────────────────────────────────────────
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'demo';
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant "demo" introuvable. Lance d''abord le seed standard.';
  END IF;

  -- ─── 1. Cleanup idempotent (uniquement les données BIG) ──────────
  RAISE NOTICE 'Cleanup BIG…';

  DELETE FROM timetable_entries
    WHERE class_id IN (
      SELECT id FROM classes WHERE name LIKE 'BIG-%' AND tenant_id = v_tenant_id
    );
  DELETE FROM teacher_assignments
    WHERE class_id IN (
      SELECT id FROM classes WHERE name LIKE 'BIG-%' AND tenant_id = v_tenant_id
    );
  DELETE FROM student_classes
    WHERE class_id IN (
      SELECT id FROM classes WHERE name LIKE 'BIG-%' AND tenant_id = v_tenant_id
    );
  DELETE FROM person_relations
    WHERE child_id IN (
      SELECT id FROM persons WHERE metadata->>'big_seed' = 'true' AND tenant_id = v_tenant_id
    );
  DELETE FROM classes WHERE name LIKE 'BIG-%' AND tenant_id = v_tenant_id;

  -- Profs et élèves créés par ce script
  DELETE FROM persons
    WHERE metadata->>'big_seed' = 'true'
      AND tenant_id = v_tenant_id;

  DELETE FROM curriculum_subjects
    WHERE level_id IN (
      SELECT id FROM levels WHERE code LIKE 'big-%' AND tenant_id = v_tenant_id
    );

  DELETE FROM rooms WHERE code LIKE 'BIG-%' AND tenant_id = v_tenant_id;
  DELETE FROM subjects WHERE code LIKE 'big-%' AND tenant_id = v_tenant_id;
  DELETE FROM levels WHERE code LIKE 'big-%' AND tenant_id = v_tenant_id;
  DELETE FROM cycles WHERE code = 'big-college' AND tenant_id = v_tenant_id;
  DELETE FROM academic_years WHERE label = 'BIG-2025-2026' AND tenant_id = v_tenant_id;

  -- ─── 2. Année scolaire dédiée (inactive) ─────────────────────────
  RAISE NOTICE 'Création année BIG-2025-2026…';

  v_year_id := gen_random_uuid();
  INSERT INTO academic_years (id, tenant_id, label, start_date, end_date, active)
  VALUES (v_year_id, v_tenant_id, 'BIG-2025-2026',
          '2025-09-01', '2026-06-30', false);

  -- ─── 3. Cycle + 3 niveaux (collège) ──────────────────────────────
  v_cycle_id := gen_random_uuid();
  INSERT INTO cycles (id, tenant_id, code, label, "order")
  VALUES (v_cycle_id, v_tenant_id, 'big-college', 'Collège (BIG)', 1);

  v_lvl_1ac := gen_random_uuid();
  v_lvl_2ac := gen_random_uuid();
  v_lvl_3ac := gen_random_uuid();
  INSERT INTO levels (id, tenant_id, cycle_id, code, label, "order") VALUES
    (v_lvl_1ac, v_tenant_id, v_cycle_id, 'big-1ac', '1AC (BIG)', 1),
    (v_lvl_2ac, v_tenant_id, v_cycle_id, 'big-2ac', '2AC (BIG)', 2),
    (v_lvl_3ac, v_tenant_id, v_cycle_id, 'big-3ac', '3AC (BIG)', 3);

  -- ─── 4. 10 matières ──────────────────────────────────────────────
  RAISE NOTICE 'Création 10 matières…';

  v_sub_math := gen_random_uuid();
  v_sub_fr   := gen_random_uuid();
  v_sub_ar   := gen_random_uuid();
  v_sub_en   := gen_random_uuid();
  v_sub_hg   := gen_random_uuid();
  v_sub_svt  := gen_random_uuid();
  v_sub_pc   := gen_random_uuid();
  v_sub_eps  := gen_random_uuid();
  v_sub_ei   := gen_random_uuid();
  v_sub_info := gen_random_uuid();

  INSERT INTO subjects (id, tenant_id, code, label, scale, coefficient, "order") VALUES
    (v_sub_math, v_tenant_id, 'big-math', 'Mathématiques (BIG)',         20, 4, 1),
    (v_sub_fr,   v_tenant_id, 'big-fr',   'Français (BIG)',              20, 4, 2),
    (v_sub_ar,   v_tenant_id, 'big-ar',   'Arabe (BIG)',                 20, 4, 3),
    (v_sub_en,   v_tenant_id, 'big-en',   'Anglais (BIG)',               20, 2, 4),
    (v_sub_hg,   v_tenant_id, 'big-hg',   'Histoire-Géographie (BIG)',   20, 2, 5),
    (v_sub_svt,  v_tenant_id, 'big-svt',  'SVT (BIG)',                   20, 2, 6),
    (v_sub_pc,   v_tenant_id, 'big-pc',   'Physique-Chimie (BIG)',       20, 2, 7),
    (v_sub_eps,  v_tenant_id, 'big-eps',  'EPS (BIG)',                   20, 1, 8),
    (v_sub_ei,   v_tenant_id, 'big-ei',   'Éducation islamique (BIG)',   20, 1, 9),
    (v_sub_info, v_tenant_id, 'big-info', 'Informatique (BIG)',          20, 1, 10);

  -- ─── 5. CurriculumSubject (3 niveaux × 10 matières) ──────────────
  -- Volumes types collège marocain
  INSERT INTO curriculum_subjects (id, tenant_id, level_id, subject_id, weekly_hours, coefficient, "order", updated_at)
  SELECT gen_random_uuid(), v_tenant_id, t.level_id, t.subject_id, t.h, t.coef, t.ord, NOW()
  FROM (VALUES
    -- 1AC (26h)
    (v_lvl_1ac, v_sub_math, 5, 4, 1), (v_lvl_1ac, v_sub_fr, 4, 4, 2),
    (v_lvl_1ac, v_sub_ar, 4, 4, 3),   (v_lvl_1ac, v_sub_en, 3, 2, 4),
    (v_lvl_1ac, v_sub_hg, 2, 2, 5),   (v_lvl_1ac, v_sub_svt, 2, 2, 6),
    (v_lvl_1ac, v_sub_pc, 2, 2, 7),   (v_lvl_1ac, v_sub_eps, 2, 1, 8),
    (v_lvl_1ac, v_sub_ei, 1, 1, 9),   (v_lvl_1ac, v_sub_info, 1, 1, 10),
    -- 2AC (26h)
    (v_lvl_2ac, v_sub_math, 5, 4, 1), (v_lvl_2ac, v_sub_fr, 4, 4, 2),
    (v_lvl_2ac, v_sub_ar, 4, 4, 3),   (v_lvl_2ac, v_sub_en, 3, 2, 4),
    (v_lvl_2ac, v_sub_hg, 2, 2, 5),   (v_lvl_2ac, v_sub_svt, 2, 2, 6),
    (v_lvl_2ac, v_sub_pc, 2, 2, 7),   (v_lvl_2ac, v_sub_eps, 2, 1, 8),
    (v_lvl_2ac, v_sub_ei, 1, 1, 9),   (v_lvl_2ac, v_sub_info, 1, 1, 10),
    -- 3AC (28h)
    (v_lvl_3ac, v_sub_math, 5, 4, 1), (v_lvl_3ac, v_sub_fr, 4, 4, 2),
    (v_lvl_3ac, v_sub_ar, 4, 4, 3),   (v_lvl_3ac, v_sub_en, 3, 2, 4),
    (v_lvl_3ac, v_sub_hg, 3, 2, 5),   (v_lvl_3ac, v_sub_svt, 2, 2, 6),
    (v_lvl_3ac, v_sub_pc, 3, 2, 7),   (v_lvl_3ac, v_sub_eps, 2, 1, 8),
    (v_lvl_3ac, v_sub_ei, 1, 1, 9),   (v_lvl_3ac, v_sub_info, 1, 1, 10)
  ) AS t(level_id, subject_id, h, coef, ord);

  -- ─── 6. 18 salles ────────────────────────────────────────────────
  RAISE NOTICE 'Création 18 salles…';

  -- 9 salles standard
  v_room_std := ARRAY[]::uuid[];
  FOR v_i IN 1..9 LOOP
    v_room_id := gen_random_uuid();
    v_room_std := v_room_std || v_room_id;
    INSERT INTO rooms (id, tenant_id, code, label, capacity, equipment)
    VALUES (v_room_id, v_tenant_id,
            format('BIG-A%s', lpad(v_i::text, 2, '0')),
            format('Salle standard A%s', lpad(v_i::text, 2, '0')),
            35, ARRAY['Tableau', 'Vidéoprojecteur']);
  END LOOP;

  -- 2 labos SVT + 2 labos PC
  v_room_lab := ARRAY[]::uuid[];
  FOR v_i IN 1..2 LOOP
    v_room_id := gen_random_uuid();
    v_room_lab := v_room_lab || v_room_id;
    INSERT INTO rooms (id, tenant_id, code, label, capacity, equipment)
    VALUES (v_room_id, v_tenant_id,
            format('BIG-SVT%s', v_i),
            format('Labo SVT %s', v_i),
            30, ARRAY['Microscopes', 'Paillasses', 'Tableau']);
  END LOOP;
  FOR v_i IN 1..2 LOOP
    v_room_id := gen_random_uuid();
    v_room_lab := v_room_lab || v_room_id;
    INSERT INTO rooms (id, tenant_id, code, label, capacity, equipment)
    VALUES (v_room_id, v_tenant_id,
            format('BIG-PC%s', v_i),
            format('Labo Physique-Chimie %s', v_i),
            30, ARRAY['Paillasses', 'Hottes', 'Tableau']);
  END LOOP;

  -- 2 salles info
  v_room_info := ARRAY[]::uuid[];
  FOR v_i IN 1..2 LOOP
    v_room_id := gen_random_uuid();
    v_room_info := v_room_info || v_room_id;
    INSERT INTO rooms (id, tenant_id, code, label, capacity, equipment)
    VALUES (v_room_id, v_tenant_id,
            format('BIG-INFO%s', v_i),
            format('Salle informatique %s', v_i),
            25, ARRAY['25 PC', 'Tableau interactif']);
  END LOOP;

  -- Gymnase
  v_room_eps := gen_random_uuid();
  INSERT INTO rooms (id, tenant_id, code, label, capacity, equipment)
  VALUES (v_room_eps, v_tenant_id, 'BIG-GYM', 'Gymnase', 60,
          ARRAY['Tapis', 'Ballons', 'Vestiaires']);

  -- 2 salles supplémentaires
  v_room_other := ARRAY[]::uuid[];
  FOR v_i IN 1..2 LOOP
    v_room_id := gen_random_uuid();
    v_room_other := v_room_other || v_room_id;
    INSERT INTO rooms (id, tenant_id, code, label, capacity, equipment)
    VALUES (v_room_id, v_tenant_id,
            format('BIG-B%s', v_i),
            format('Salle polyvalente B%s', v_i),
            40, ARRAY['Tableau', 'Vidéoprojecteur']);
  END LOOP;

  -- ─── 7. 18 enseignants ──────────────────────────────────────────
  RAISE NOTICE 'Création 18 enseignants…';

  -- Dispo standard : lundi-vendredi 08:00-18:00
  v_availability_full := jsonb_build_object(
    'MON', jsonb_build_array(jsonb_build_object('from', '08:00', 'to', '18:00')),
    'TUE', jsonb_build_array(jsonb_build_object('from', '08:00', 'to', '18:00')),
    'WED', jsonb_build_array(jsonb_build_object('from', '08:00', 'to', '18:00')),
    'THU', jsonb_build_array(jsonb_build_object('from', '08:00', 'to', '18:00')),
    'FRI', jsonb_build_array(jsonb_build_object('from', '08:00', 'to', '18:00')),
    'SAT', jsonb_build_array(),
    'SUN', jsonb_build_array()
  );
  -- Quelques profs à mi-temps (matin uniquement)
  v_availability_morning := jsonb_build_object(
    'MON', jsonb_build_array(jsonb_build_object('from', '08:00', 'to', '13:00')),
    'TUE', jsonb_build_array(jsonb_build_object('from', '08:00', 'to', '13:00')),
    'WED', jsonb_build_array(jsonb_build_object('from', '08:00', 'to', '13:00')),
    'THU', jsonb_build_array(jsonb_build_object('from', '08:00', 'to', '13:00')),
    'FRI', jsonb_build_array(jsonb_build_object('from', '08:00', 'to', '13:00')),
    'SAT', jsonb_build_array(),
    'SUN', jsonb_build_array()
  );

  -- Helper inline pour créer un prof
  v_t_math := ARRAY[]::uuid[];
  v_t_fr   := ARRAY[]::uuid[];
  v_t_ar   := ARRAY[]::uuid[];
  v_t_en   := ARRAY[]::uuid[];
  v_t_eps  := ARRAY[]::uuid[];

  -- 3 profs Maths (CDI 24h)
  FOR v_i IN 1..3 LOOP
    v_t_math := v_t_math || gen_random_uuid();
    INSERT INTO persons (id, tenant_id, type, first_name, last_name, gender, availability, metadata, experience_years, contractual_hours_per_week, updated_at)
    VALUES (v_t_math[v_i], v_tenant_id, 'TEACHER',
            (ARRAY['Karim', 'Amina', 'Mehdi'])[v_i],
            (ARRAY['El Fassi', 'Bennani', 'Lahcen'])[v_i],
            (ARRAY['M', 'F', 'M'])[v_i]::"Gender", v_availability_full,
            '{"big_seed": true, "subject": "math"}'::jsonb, 10, 24, NOW());
  END LOOP;

  -- 2 profs Français (CDI 20h)
  FOR v_i IN 1..2 LOOP
    v_t_fr := v_t_fr || gen_random_uuid();
    INSERT INTO persons (id, tenant_id, type, first_name, last_name, gender, availability, metadata, experience_years, contractual_hours_per_week, updated_at)
    VALUES (v_t_fr[v_i], v_tenant_id, 'TEACHER',
            (ARRAY['Sophie', 'Hicham'])[v_i],
            (ARRAY['Tazi', 'Cherkaoui'])[v_i],
            (ARRAY['F', 'M'])[v_i]::"Gender", v_availability_full,
            '{"big_seed": true, "subject": "fr"}'::jsonb, 8, 20, NOW());
  END LOOP;

  -- 2 profs Arabe (CDI 20h)
  FOR v_i IN 1..2 LOOP
    v_t_ar := v_t_ar || gen_random_uuid();
    INSERT INTO persons (id, tenant_id, type, first_name, last_name, gender, availability, metadata, experience_years, contractual_hours_per_week, updated_at)
    VALUES (v_t_ar[v_i], v_tenant_id, 'TEACHER',
            (ARRAY['Abdellah', 'Fatima'])[v_i],
            (ARRAY['Mansouri', 'Alaoui'])[v_i],
            (ARRAY['M', 'F'])[v_i]::"Gender", v_availability_full,
            '{"big_seed": true, "subject": "ar"}'::jsonb, 12, 20, NOW());
  END LOOP;

  -- 2 profs Anglais (CDI 18h)
  FOR v_i IN 1..2 LOOP
    v_t_en := v_t_en || gen_random_uuid();
    INSERT INTO persons (id, tenant_id, type, first_name, last_name, gender, availability, metadata, experience_years, contractual_hours_per_week, updated_at)
    VALUES (v_t_en[v_i], v_tenant_id, 'TEACHER',
            (ARRAY['John', 'Yasmina'])[v_i],
            (ARRAY['Smith', 'Berrada'])[v_i],
            (ARRAY['M', 'F'])[v_i]::"Gender", v_availability_full,
            '{"big_seed": true, "subject": "en"}'::jsonb, 6, 18, NOW());
  END LOOP;

  -- 1 prof HG (CDI 24h)
  v_t_hg := gen_random_uuid();
  INSERT INTO persons (id, tenant_id, type, first_name, last_name, gender, availability, metadata, experience_years, contractual_hours_per_week, updated_at)
  VALUES (v_t_hg, v_tenant_id, 'TEACHER', 'Rachid', 'Skalli', 'M', v_availability_full,
          '{"big_seed": true, "subject": "hg"}'::jsonb, 15, 24, NOW());

  -- 1 prof SVT (CDI 24h)
  v_t_svt := gen_random_uuid();
  INSERT INTO persons (id, tenant_id, type, first_name, last_name, gender, availability, metadata, experience_years, contractual_hours_per_week, updated_at)
  VALUES (v_t_svt, v_tenant_id, 'TEACHER', 'Naima', 'Bouhassoun', 'F', v_availability_full,
          '{"big_seed": true, "subject": "svt"}'::jsonb, 9, 24, NOW());

  -- 1 prof PC (CDI 24h)
  v_t_pc := gen_random_uuid();
  INSERT INTO persons (id, tenant_id, type, first_name, last_name, gender, availability, metadata, experience_years, contractual_hours_per_week, updated_at)
  VALUES (v_t_pc, v_tenant_id, 'TEACHER', 'Othmane', 'Fassi', 'M', v_availability_full,
          '{"big_seed": true, "subject": "pc"}'::jsonb, 11, 24, NOW());

  -- 2 profs EPS (CDI 18h)
  FOR v_i IN 1..2 LOOP
    v_t_eps := v_t_eps || gen_random_uuid();
    INSERT INTO persons (id, tenant_id, type, first_name, last_name, gender, availability, metadata, experience_years, contractual_hours_per_week, updated_at)
    VALUES (v_t_eps[v_i], v_tenant_id, 'TEACHER',
            (ARRAY['Hassan', 'Imane'])[v_i],
            (ARRAY['Ouazzani', 'Sefrioui'])[v_i],
            (ARRAY['M', 'F'])[v_i]::"Gender", v_availability_full,
            '{"big_seed": true, "subject": "eps"}'::jsonb, 7, 18, NOW());
  END LOOP;

  -- 1 prof Éducation islamique (mi-temps matin 12h)
  v_t_ei := gen_random_uuid();
  INSERT INTO persons (id, tenant_id, type, first_name, last_name, gender, availability, metadata, experience_years, contractual_hours_per_week, updated_at)
  VALUES (v_t_ei, v_tenant_id, 'TEACHER', 'Mohammed', 'El Idrissi', 'M', v_availability_morning,
          '{"big_seed": true, "subject": "ei"}'::jsonb, 20, 12, NOW());

  -- 1 prof Informatique (CDI 18h)
  v_t_info := gen_random_uuid();
  INSERT INTO persons (id, tenant_id, type, first_name, last_name, gender, availability, metadata, experience_years, contractual_hours_per_week, updated_at)
  VALUES (v_t_info, v_tenant_id, 'TEACHER', 'Sami', 'Lazrak', 'M', v_availability_full,
          '{"big_seed": true, "subject": "info"}'::jsonb, 5, 18, NOW());

  -- ─── 8. 9 classes (3 niveaux × A, B, C) ──────────────────────────
  RAISE NOTICE 'Création 9 classes…';

  v_idx := 1;
  FOREACH v_level_id IN ARRAY ARRAY[v_lvl_1ac, v_lvl_2ac, v_lvl_3ac]
  LOOP
    FOR v_j IN 1..3 LOOP  -- A, B, C
      v_classes[v_idx] := gen_random_uuid();
      v_label := 'BIG-' ||
        CASE v_level_id
          WHEN v_lvl_1ac THEN '1AC'
          WHEN v_lvl_2ac THEN '2AC'
          WHEN v_lvl_3ac THEN '3AC'
        END ||
        chr(64 + v_j);  -- A, B, C
      INSERT INTO classes (id, tenant_id, academic_year_id, level_id, name, capacity)
      VALUES (v_classes[v_idx], v_tenant_id, v_year_id, v_level_id, v_label, 35);
      v_idx := v_idx + 1;
    END LOOP;
  END LOOP;

  -- ─── 9. 270 élèves + 270 parents + StudentClass ──────────────────
  RAISE NOTICE 'Création 270 élèves + 270 parents…';

  FOR v_i IN 1..9 LOOP  -- chaque classe
    FOR v_j IN 1..30 LOOP  -- 30 élèves
      v_student_id := gen_random_uuid();
      v_parent_id  := gen_random_uuid();
      v_label := format('S%s%s',
        lpad(v_i::text, 1, '0'),
        lpad(v_j::text, 2, '0'));

      -- Élève
      INSERT INTO persons (id, tenant_id, type, first_name, last_name, gender, birth_date, metadata, updated_at)
      VALUES (v_student_id, v_tenant_id, 'STUDENT',
              v_first_names[((v_i * 30 + v_j) % array_length(v_first_names, 1)) + 1],
              v_last_names[((v_i * 30 + v_j) % array_length(v_last_names, 1)) + 1] || '-' || v_label,
              (CASE WHEN (v_j % 2) = 0 THEN 'F' ELSE 'M' END)::"Gender",
              '2012-01-01'::date + ((v_j * 17) % 365),
              jsonb_build_object('big_seed', true, 'student_code', 'BIG-' || v_label),
              NOW());

      -- Parent
      INSERT INTO persons (id, tenant_id, type, first_name, last_name, gender, contacts, metadata, updated_at)
      VALUES (v_parent_id, v_tenant_id, 'PARENT',
              v_first_names[((v_i + v_j * 7) % array_length(v_first_names, 1)) + 1],
              v_last_names[((v_i * 30 + v_j) % array_length(v_last_names, 1)) + 1] || '-' || v_label,
              (CASE WHEN (v_j % 2) = 0 THEN 'F' ELSE 'M' END)::"Gender",
              jsonb_build_object(
                'email',
                format('parent.%s@big.demo.jawal.ma', lower(v_label)),
                'phone',
                format('+212600%s', lpad((v_i * 100 + v_j)::text, 6, '0'))
              ),
              jsonb_build_object('big_seed', true),
              NOW());

      -- Inscription en classe
      INSERT INTO student_classes (id, tenant_id, student_id, class_id)
      VALUES (gen_random_uuid(), v_tenant_id, v_student_id, v_classes[v_i]);

      -- Liaison parenté
      INSERT INTO person_relations (id, tenant_id, child_id, parent_id, type)
      VALUES (gen_random_uuid(), v_tenant_id, v_student_id, v_parent_id, 'FATHER');
    END LOOP;
  END LOOP;

  -- ─── 10. 90 TeacherAssignment (9 classes × 10 matières) ──────────
  RAISE NOTICE 'Création 90 affectations pédagogiques…';

  FOR v_i IN 1..9 LOOP  -- pour chaque classe
    v_class_id := v_classes[v_i];
    -- Pour chaque matière, on choisit un prof parmi le pool, en répartissant
    -- avec un round-robin sur (v_i mod nbProfs)

    -- Maths : 3 profs, on tourne
    INSERT INTO teacher_assignments (id, tenant_id, teacher_id, subject_id, class_id, academic_year_id, hours_per_week, updated_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_t_math[((v_i - 1) % 3) + 1], v_sub_math, v_class_id, v_year_id, 5, NOW());

    -- Français
    INSERT INTO teacher_assignments (id, tenant_id, teacher_id, subject_id, class_id, academic_year_id, hours_per_week, updated_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_t_fr[((v_i - 1) % 2) + 1], v_sub_fr, v_class_id, v_year_id, 4, NOW());

    -- Arabe
    INSERT INTO teacher_assignments (id, tenant_id, teacher_id, subject_id, class_id, academic_year_id, hours_per_week, updated_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_t_ar[((v_i - 1) % 2) + 1], v_sub_ar, v_class_id, v_year_id, 4, NOW());

    -- Anglais
    INSERT INTO teacher_assignments (id, tenant_id, teacher_id, subject_id, class_id, academic_year_id, hours_per_week, updated_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_t_en[((v_i - 1) % 2) + 1], v_sub_en, v_class_id, v_year_id, 3, NOW());

    -- HG
    INSERT INTO teacher_assignments (id, tenant_id, teacher_id, subject_id, class_id, academic_year_id, hours_per_week, updated_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_t_hg, v_sub_hg, v_class_id, v_year_id,
            CASE WHEN v_i > 6 THEN 3 ELSE 2 END, NOW());  -- 3h en 3AC

    -- SVT
    INSERT INTO teacher_assignments (id, tenant_id, teacher_id, subject_id, class_id, academic_year_id, hours_per_week, updated_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_t_svt, v_sub_svt, v_class_id, v_year_id, 2, NOW());

    -- PC
    INSERT INTO teacher_assignments (id, tenant_id, teacher_id, subject_id, class_id, academic_year_id, hours_per_week, updated_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_t_pc, v_sub_pc, v_class_id, v_year_id,
            CASE WHEN v_i > 6 THEN 3 ELSE 2 END, NOW());  -- 3h en 3AC

    -- EPS (2 profs, round robin)
    INSERT INTO teacher_assignments (id, tenant_id, teacher_id, subject_id, class_id, academic_year_id, hours_per_week, updated_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_t_eps[((v_i - 1) % 2) + 1], v_sub_eps, v_class_id, v_year_id, 2, NOW());

    -- EI
    INSERT INTO teacher_assignments (id, tenant_id, teacher_id, subject_id, class_id, academic_year_id, hours_per_week, updated_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_t_ei, v_sub_ei, v_class_id, v_year_id, 1, NOW());

    -- Info
    INSERT INTO teacher_assignments (id, tenant_id, teacher_id, subject_id, class_id, academic_year_id, hours_per_week, updated_at)
    VALUES (gen_random_uuid(), v_tenant_id, v_t_info, v_sub_info, v_class_id, v_year_id, 1, NOW());
  END LOOP;

  -- ─── Résumé ──────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Seed BIG terminé.';
  RAISE NOTICE '   Année       : BIG-2025-2026 (inactive)';
  RAISE NOTICE '   Cycle       : Collège (BIG)';
  RAISE NOTICE '   Niveaux     : 3 (1AC, 2AC, 3AC)';
  RAISE NOTICE '   Classes     : 9 (% A/B/C × 3 niveaux)', 'BIG-';
  RAISE NOTICE '   Élèves      : 270 (30/classe)';
  RAISE NOTICE '   Parents     : 270';
  RAISE NOTICE '   Enseignants : 16 (dont 1 mi-temps matin)';
  RAISE NOTICE '   Matières    : 10';
  RAISE NOTICE '   Salles      : 18';
  RAISE NOTICE '   Programme   : 30 lignes';
  RAISE NOTICE '   Affectations: 90';
  RAISE NOTICE '';
  RAISE NOTICE 'Volume horaire total à placer : ~234h sur 9 classes';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Pour générer les EDT :';
  RAISE NOTICE '  1. Login sur http://localhost:3000 (admin@demo.jawal.ma / demo1234)';
  RAISE NOTICE '  2. Aller sur /admin/timetable/generate';
  RAISE NOTICE '  3. Sélectionner l''année BIG-2025-2026';
  RAISE NOTICE '  4. Cocher les 9 classes BIG-* et cliquer "Générer les EDT"';
  RAISE NOTICE '';
END $$;
