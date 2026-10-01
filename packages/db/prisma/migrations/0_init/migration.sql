-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TenantProfile" AS ENUM ('K12', 'SUPERIEUR', 'FORMATION_PRO', 'MIXED');

-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('STUDENT', 'PARENT', 'TEACHER', 'STAFF');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('FATHER', 'MOTHER', 'LEGAL_GUARDIAN', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('CDI', 'CDD', 'VACATAIRE', 'STAGIAIRE', 'AUTRE');

-- CreateEnum
CREATE TYPE "StaffService" AS ENUM ('DIRECTION', 'ADMINISTRATION', 'SCOLARITE', 'VIE_SCOLAIRE', 'COMPTABILITE', 'SERVICES_GENERAUX', 'RESTAURATION', 'INFIRMERIE', 'INFORMATIQUE', 'BIBLIOTHEQUE', 'AUTRE');

-- CreateEnum
CREATE TYPE "PayrollPaymentMethod" AS ENUM ('BANK_TRANSFER', 'CHECK', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('M', 'F', 'X');

-- CreateEnum
CREATE TYPE "PeriodKind" AS ENUM ('TRIMESTER', 'SEMESTER', 'YEAR', 'MODULE', 'SESSION');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "EvaluationOptionalMode" AS ENUM ('BONUS', 'NOTE');

-- CreateEnum
CREATE TYPE "AttendanceEventCategory" AS ENUM ('ABSENCE', 'RETARD', 'EXCLUSION');

-- CreateEnum
CREATE TYPE "AttendanceEventStatus" AS ENUM ('PENDING', 'CONFIRMED', 'JUSTIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StaffAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'LEAVE');

-- CreateEnum
CREATE TYPE "JustificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('DRAFT', 'DOCUMENTS_MANQUANTS', 'DOSSIER_COMPLET', 'ACCEPTE', 'REFUSE', 'INSCRIPTION_VALIDEE', 'AFFECTE', 'ACTIVE', 'WITHDRAWN', 'GRADUATED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "TimetableOverrideKind" AS ENUM ('CANCELLED', 'SUBSTITUTION');

-- CreateEnum
CREATE TYPE "SubstitutionApproval" AS ENUM ('PENDING', 'APPROVED', 'REFUSED');

-- CreateEnum
CREATE TYPE "TimetableConstraintKind" AS ENUM ('MAX_SAME_SUBJECT_PER_DAY', 'NO_GAPS', 'REQUIRES_CONSECUTIVE_SUBJECTS', 'MAX_HOURS_PER_DAY_TEACHER', 'MAX_CONSECUTIVE_HOURS_TEACHER', 'TEACHER_LUNCH_BREAK', 'REQUIRE_SUBJECT_ROOM_TYPE', 'MINIMIZE_ROOM_CHANGES', 'BALANCE_DAILY_LOAD');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHEQUE', 'TRANSFER', 'CMI', 'STRIPE', 'OTHER');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'PARENTS', 'TEACHERS', 'STAFF', 'CLASS', 'LEVEL');

-- CreateEnum
CREATE TYPE "CouncilDecision" AS ENUM ('FELICITATIONS', 'ENCOURAGEMENTS', 'COMPLIMENTS', 'AVERTISSEMENT_TRAVAIL', 'AVERTISSEMENT_COMP', 'PASSAGE', 'REDOUBLEMENT', 'ORIENTATION');

-- CreateEnum
CREATE TYPE "HomeworkType" AS ENUM ('EXERCICE', 'LECTURE', 'REVISION', 'PROJET', 'AUTRE');

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('FILE', 'LINK');

-- CreateEnum
CREATE TYPE "HomeworkDifficulty" AS ENUM ('FACILE', 'MOYEN', 'DIFFICILE');

-- CreateEnum
CREATE TYPE "SurveyAudience" AS ENUM ('ALL', 'PARENTS', 'TEACHERS', 'STAFF', 'STUDENTS');

-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SurveyQuestionType" AS ENUM ('RATING_5', 'TEXT');

-- CreateEnum
CREATE TYPE "StudentRegime" AS ENUM ('EXTERNE', 'DEMI_PENSIONNAIRE', 'INTERNE');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'RESIGNED', 'CONTRACT_END');

-- CreateEnum
CREATE TYPE "StaffAbsenceKind" AS ENUM ('SICK_LEAVE', 'TRAINING', 'PARENTAL', 'OFFICIAL_DUTY', 'UNJUSTIFIED', 'OTHER');

-- CreateEnum
CREATE TYPE "CarnetEntryType" AS ENUM ('OBSERVATION', 'ENCOURAGEMENT', 'FELICITATION', 'REMARQUE_DISCIPLINAIRE', 'DEFAUT_CARNET', 'AVERTISSEMENT', 'MESSAGE_DIRECTION', 'CONVOCATION', 'ABSENCE', 'RETARD', 'EXCLUSION');

-- CreateEnum
CREATE TYPE "SupportEnrollmentStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SupportPricingMode" AS ENUM ('FREE', 'PER_SESSION', 'MONTHLY', 'TERM', 'ANNUAL');

-- CreateEnum
CREATE TYPE "FeeKind" AS ENUM ('ANNUAL', 'EXCEPTIONAL');

-- CreateEnum
CREATE TYPE "FeeCategory" AS ENUM ('TUITION', 'INSCRIPTION', 'TRANSPORT', 'CANTEEN', 'DAYCARE', 'OTHER');

-- CreateEnum
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "ExceptionalFeeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FeeConsent" AS ENUM ('PENDING', 'ACCEPTED', 'REFUSED');

-- CreateEnum
CREATE TYPE "RefundMode" AS ENUM ('REFUNDED', 'CREDITED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SALARY', 'RENT', 'UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'TRANSPORT', 'TAXES', 'OTHER');

-- CreateEnum
CREATE TYPE "BusStatus" AS ENUM ('EN_SERVICE', 'PANNE', 'REMPLACEMENT');

-- CreateEnum
CREATE TYPE "TransportAssignStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TransportDirection" AS ENUM ('MORNING', 'EVENING');

-- CreateEnum
CREATE TYPE "TransportAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'NOT_PICKED_UP', 'BOARDED', 'DROPPED', 'INCIDENT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveDayPart" AS ENUM ('FULL', 'AM', 'PM', 'SESSIONS');

-- CreateEnum
CREATE TYPE "OvertimeSource" AS ENUM ('TEACHING_OVER_QUOTA', 'SUBSTITUTION', 'PARASCOLAIRE', 'AFTER_HOURS', 'EXAM_SUPERVISION', 'SPECIAL_EVENT');

-- CreateEnum
CREATE TYPE "OvertimeStatus" AS ENUM ('DECLARED', 'RH_VALIDATED', 'DIRECTION_APPROVED', 'PROCESSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATED', 'RH_VALIDATED', 'DIRECTION_APPROVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "BookCondition" AS ENUM ('NEW', 'VERY_GOOD', 'GOOD', 'FAIR');

-- CreateEnum
CREATE TYPE "BookCopySource" AS ENUM ('SCHOOL_NEW', 'STUDENT_USED');

-- CreateEnum
CREATE TYPE "BookCopyStatus" AS ENUM ('DEPOSITED', 'FOR_SALE', 'RESERVED', 'SOLD', 'WITHDRAWN', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BookCampaignStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "BookTransactionType" AS ENUM ('SALE', 'REFUND');

-- CreateEnum
CREATE TYPE "BookRefundMode" AS ENUM ('CASH', 'FEE_CREDIT');

-- CreateEnum
CREATE TYPE "FiscalYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccountingJournal" AS ENUM ('VE', 'AC', 'BQ', 'CA', 'PA', 'OD');

-- CreateEnum
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "RadiationType" AS ENUM ('TRANSFERT', 'DEPART', 'AUTRE');

-- CreateEnum
CREATE TYPE "RadiationStatus" AS ENUM ('REQUESTED', 'VIE_SCOLAIRE_OK', 'COMPTA_OK', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING_CHECK', 'CALCULATED', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('VIREMENT', 'CHEQUE', 'ESPECES');

-- CreateEnum
CREATE TYPE "RefundBasis" AS ENUM ('INSTALLMENT', 'PRORATA');

-- CreateEnum
CREATE TYPE "CompetencyKind" AS ENUM ('DISCIPLINARY', 'TRANSVERSAL');

-- CreateEnum
CREATE TYPE "FrameworkStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssessmentSource" AS ENUM ('CLASS', 'SUPPORT', 'REPORT');

-- CreateEnum
CREATE TYPE "ExamKind" AS ENUM ('SEMESTRIEL', 'REGIONAL', 'NATIONAL', 'BLANC', 'CONTROLE_CONTINU', 'DEVOIR_SURVEILLE', 'DEVOIR_MAISON', 'COMPOSITION');

-- CreateEnum
CREATE TYPE "ExamSessionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ExamPaperType" AS ENUM ('SPECIALITY', 'SECONDARY', 'LITERARY');

-- CreateTable
CREATE TABLE "tenant_groups" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "group_id" UUID,
    "custom_domain" TEXT,
    "massar_code" TEXT,
    "profile" "TenantProfile" NOT NULL DEFAULT 'K12',
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "locale_default" TEXT NOT NULL DEFAULT 'fr',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Casablanca',
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "logo_file_id" UUID,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_modules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT,
    "email_verified" TIMESTAMP(3),
    "mfa_secret" TEXT,
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "last_login_at" TIMESTAMP(3),
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tenants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "PersonType" NOT NULL,
    "role_id" UUID,
    "service" "StaffService",
    "service_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "first_name_ar" TEXT,
    "last_name_ar" TEXT,
    "massar_id" TEXT,
    "birth_date" DATE,
    "birth_place" TEXT,
    "birth_place_ar" TEXT,
    "gender" "Gender",
    "nationality" TEXT,
    "nationality_ar" TEXT,
    "address_ar" TEXT,
    "city_ar" TEXT,
    "father_first_name_ar" TEXT,
    "mother_first_name_ar" TEXT,
    "cin" TEXT,
    "regime" "StudentRegime",
    "uses_transport" BOOLEAN NOT NULL DEFAULT false,
    "contacts" JSONB NOT NULL DEFAULT '{}',
    "address" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "hire_date" DATE,
    "contract_end_date" DATE,
    "contract_type" "ContractType",
    "employment_status" "EmploymentStatus",
    "contractual_hours_per_week" INTEGER,
    "contract_file_id" UUID,
    "photo_file_id" UUID,
    "experience_years" INTEGER,
    "availability" JSONB NOT NULL DEFAULT '{}',
    "rib" TEXT,
    "bank_name" TEXT,
    "payroll_method" "PayrollPaymentMethod",
    "gross_salary" DECIMAL(12,2),
    "net_salary" DECIMAL(12,2),
    "benefits" JSONB NOT NULL DEFAULT '[]',
    "deductions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_specialties" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_cycles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_priority_classes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_priority_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diplomas" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "institution" TEXT,
    "year" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diplomas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "hours_per_week" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "applies_to" "PersonType" NOT NULL,
    "code" TEXT NOT NULL,
    "label_fr" TEXT NOT NULL,
    "label_ar" TEXT NOT NULL,
    "service_id" UUID,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label_fr" TEXT NOT NULL,
    "label_ar" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_relations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "type" "RelationType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_persons" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "relationship" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "permissions" TEXT[],
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periods" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "kind" "PeriodKind" NOT NULL,
    "label" TEXT NOT NULL,
    "label_ar" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "label_ar" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "label_ar" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_subjects" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "weekly_hours" DOUBLE PRECISION NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "track_id" UUID,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 30,
    "main_teacher_id" UUID,
    "delegate_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "split_hours" INTEGER,
    "teacher_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_group_slots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "slot_id" UUID NOT NULL,
    "group_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_group_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_group_members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_classes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unenrolled_at" TIMESTAMP(3),

    CONSTRAINT "student_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "label_ar" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primary_cycle_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "owner_type" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "group_id" UUID,
    "date" DATE NOT NULL,
    "period_label" TEXT,
    "finalized_at" TIMESTAMP(3),
    "vs_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "late_minutes" INTEGER,
    "late_reason_id" UUID,
    "infirmary" BOOLEAN NOT NULL DEFAULT false,
    "punishment" BOOLEAN NOT NULL DEFAULT false,
    "exclusion" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "attendance_record_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "signaled_category" "AttendanceEventCategory" NOT NULL,
    "category" "AttendanceEventCategory" NOT NULL,
    "late_minutes" INTEGER,
    "status" "AttendanceEventStatus" NOT NULL DEFAULT 'PENDING',
    "justif_reason" TEXT,
    "review_note" TEXT,
    "processed_by_user_id" UUID,
    "processed_at" TIMESTAMP(3),
    "carnet_entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_reasons" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "for_justification" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_absence_reasons" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "label_ar" TEXT,
    "kind" "StaffAbsenceKind" NOT NULL DEFAULT 'OTHER',
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_absence_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "StaffAttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "check_in" TIMESTAMP(3),
    "check_out" TIMESTAMP(3),
    "late_minutes" INTEGER,
    "absence_reason_id" UUID,
    "deduction_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deduction_locked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "recorded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_justifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "attendance_record_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "submitted_by_user_id" UUID,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JustificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "attachment_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absence_justifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "label_ar" TEXT,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "coefficient" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "max_value" DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "optional_mode" "EvaluationOptionalMode" NOT NULL DEFAULT 'BONUS',
    "exam_paper_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "value" DOUBLE PRECISION,
    "comment" TEXT,
    "entered_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_appreciations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "authored_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subject_appreciations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carnet_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "CarnetEntryType" NOT NULL,
    "content" TEXT NOT NULL,
    "class_id" UUID,
    "subject_id" UUID,
    "attendance_session_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author_user_id" UUID,
    "author_name" TEXT NOT NULL,
    "author_role" TEXT NOT NULL,
    "visible_to_parents" BOOLEAN NOT NULL DEFAULT true,
    "parent_read_at" TIMESTAMP(3),
    "held_for_review" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carnet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appel_reminders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appel_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "council_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "general_appreciation" TEXT,
    "decision" "CouncilDecision",
    "held_at" TIMESTAMP(3),
    "authored_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "council_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "track_id" UUID,
    "class_id" UUID,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'DRAFT',
    "sibling_rank" INTEGER,
    "discount_pct" DECIMAL(5,2),
    "discount_reason" TEXT,
    "fees_generated" BOOLEAN NOT NULL DEFAULT false,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "withdrawal_reason" TEXT,
    "archived_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_user_id" UUID,
    "validated_by_user_id" UUID,
    "refusal_reason" TEXT,
    "decided_at" TIMESTAMP(3),
    "decided_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_quotas" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "required_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label_fr" TEXT NOT NULL,
    "label_ar" TEXT NOT NULL,
    "level_id" UUID,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "required_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "required_document_id" UUID,
    "file_id" UUID,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "validated_at" TIMESTAMP(3),
    "validated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollment_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "label" TEXT,
    "is_break" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "subject_id" UUID,
    "group_id" UUID,
    "teacher_id" UUID,
    "room_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_overrides" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" "TimetableOverrideKind" NOT NULL,
    "substitute_teacher_id" UUID,
    "substitute_room_id" UUID,
    "substitute_subject_id" UUID,
    "reason" TEXT,
    "validated_at" TIMESTAMP(3),
    "validated_by_user_id" UUID,
    "approval_status" "SubstitutionApproval" NOT NULL DEFAULT 'PENDING',
    "approval_by_user_id" UUID,
    "approval_at" TIMESTAMP(3),
    "approval_comment" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "activities" TEXT,
    "competencies" TEXT,
    "theme" TEXT,
    "visible_to_students" BOOLEAN NOT NULL DEFAULT true,
    "visible_to_parents" BOOLEAN NOT NULL DEFAULT true,
    "publish_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_resources" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lesson_entry_id" UUID NOT NULL,
    "kind" "ResourceKind" NOT NULL,
    "file_id" UUID,
    "url" TEXT,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homeworks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lesson_entry_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "due_date" DATE,
    "type" "HomeworkType" NOT NULL DEFAULT 'EXERCICE',
    "difficulty" "HomeworkDifficulty",
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homeworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_constraints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" "TimetableConstraintKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL,
    "class_id" UUID,
    "level_id" UUID,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surveys" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "audience" "SurveyAudience" NOT NULL DEFAULT 'PARENTS',
    "status" "SurveyStatus" NOT NULL DEFAULT 'DRAFT',
    "anonymous" BOOLEAN NOT NULL DEFAULT true,
    "academic_year_id" UUID,
    "period_id" UUID,
    "opens_at" TIMESTAMP(3),
    "closes_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_questions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "type" "SurveyQuestionType" NOT NULL DEFAULT 'RATING_5',
    "order" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_responses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_answers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "response_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "rating" INTEGER,
    "text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_courses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_id" UUID,
    "level_id" UUID,
    "title" TEXT NOT NULL,
    "pricing_mode" "SupportPricingMode" NOT NULL DEFAULT 'FREE',
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_resources" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "support_course_id" UUID NOT NULL,
    "support_session_id" UUID,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_slots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "support_course_id" UUID NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "room_id" UUID,

    CONSTRAINT "support_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_enrollments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "support_course_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "status" "SupportEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unenrolled_at" TIMESTAMP(3),

    CONSTRAINT "support_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "support_course_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "topic" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_attendance" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "appreciation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_schedules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "FeeKind" NOT NULL DEFAULT 'ANNUAL',
    "category" "FeeCategory" NOT NULL DEFAULT 'TUITION',
    "total_amount" DECIMAL(12,2) NOT NULL,
    "installment_count" INTEGER NOT NULL DEFAULT 9,
    "installment_locked" BOOLEAN NOT NULL DEFAULT false,
    "first_due_month" INTEGER NOT NULL DEFAULT 9,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "fee_schedule_item_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "fee_schedule_item_id" UUID,
    "support_course_id" UUID,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "waived_amount" DECIMAL(12,2),
    "waived_reason" TEXT,
    "waived_by_user_id" UUID,
    "waived_at" TIMESTAMP(3),
    "reminder_3d_sent_at" TIMESTAMP(3),
    "reminder_1d_sent_at" TIMESTAMP(3),
    "contentious_at" TIMESTAMP(3),
    "contentious_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "installment_ids" UUID[],
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "provider" TEXT NOT NULL DEFAULT 'CMI',
    "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider_ref" TEXT,
    "raw_result" JSONB,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "online_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exceptional_fee_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "label_fr" TEXT NOT NULL,
    "label_ar" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exceptional_fee_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exceptional_fees" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "type_id" UUID,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "activity_date" DATE,
    "due_date" DATE,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExceptionalFeeStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exceptional_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exceptional_fee_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "exceptional_fee_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "consent" "FeeConsent" NOT NULL DEFAULT 'PENDING',
    "consent_at" TIMESTAMP(3),
    "consent_by_user_id" UUID,
    "installment_id" UUID,
    "refund_mode" "RefundMode",
    "refunded_at" TIMESTAMP(3),
    "refund_file_id" UUID,
    "credit_installment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exceptional_fee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "method" "PaymentMethod",
    "note" TEXT,
    "recorded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reminders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_zones" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "annual_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "plate" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "status" "BusStatus" NOT NULL DEFAULT 'EN_SERVICE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "districts" TEXT,
    "bus_id" UUID,
    "driver_id" UUID,
    "attendant_id" UUID,
    "morning_departure" TEXT,
    "morning_arrival" TEXT,
    "evening_departure" TEXT,
    "evening_arrival" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_stops" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "zone_id" UUID,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "planned_time" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_transports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "stop_id" UUID,
    "zone_id" UUID,
    "days" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pickup_time" TEXT,
    "dropoff_time" TEXT,
    "exit_alone" BOOLEAN NOT NULL DEFAULT false,
    "security_notes" TEXT,
    "authorized_pickups" JSONB NOT NULL DEFAULT '[]',
    "status" "TransportAssignStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_transports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_attendance_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "direction" "TransportDirection" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_attendance_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "TransportAttendanceStatus" NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipient_name" TEXT,
    "student_id" UUID,
    "template" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "related_type" TEXT,
    "related_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label_fr" TEXT NOT NULL,
    "label_ar" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "accrues" BOOLEAN NOT NULL DEFAULT false,
    "accrual_per_month" DOUBLE PRECISION,
    "requires_justification" BOOLEAN NOT NULL DEFAULT false,
    "default_duration_days" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "day_part" "LeaveDayPart" NOT NULL DEFAULT 'FULL',
    "session_count" INTEGER,
    "reason" TEXT,
    "justification_file_id" UUID,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "decision_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "source" "OvertimeSource" NOT NULL,
    "note" TEXT,
    "reason" TEXT,
    "class_id" UUID,
    "start_time" TEXT,
    "end_time" TEXT,
    "replaced_person_id" UUID,
    "source_ref" TEXT,
    "status" "OvertimeStatus" NOT NULL DEFAULT 'DECLARED',
    "rh_by_user_id" UUID,
    "direction_by_user_id" UUID,
    "processed_by_user_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "label" TEXT,
    "cnss_employee_rate" DOUBLE PRECISION NOT NULL,
    "cnss_ceiling" DOUBLE PRECISION NOT NULL,
    "amo_employee_rate" DOUBLE PRECISION NOT NULL,
    "cnss_employer_rate" DOUBLE PRECISION NOT NULL,
    "family_allowance_rate" DOUBLE PRECISION NOT NULL,
    "amo_employer_rate" DOUBLE PRECISION NOT NULL,
    "training_tax_rate" DOUBLE PRECISION NOT NULL,
    "professional_expense_rate" DOUBLE PRECISION NOT NULL,
    "professional_expense_ceiling_monthly" DOUBLE PRECISION NOT NULL,
    "family_deduction_per_dependent_monthly" DOUBLE PRECISION NOT NULL,
    "max_dependents" INTEGER NOT NULL,
    "ir_brackets" JSONB NOT NULL,
    "overtime_matrix" JSONB NOT NULL,
    "seniority_scale" JSONB NOT NULL,
    "account_mapping" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_payroll_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "cnss_number" TEXT,
    "base_salary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transport_allowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "housing_allowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "benefits_in_kind" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cimr_enabled" BOOLEAN NOT NULL DEFAULT false,
    "cimr_employee_rate" DOUBLE PRECISION,
    "number_of_dependents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_payroll_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "config_snapshot" JSONB,
    "rh_by_user_id" UUID,
    "direction_by_user_id" UUID,
    "closed_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "brut" DOUBLE PRECISION NOT NULL,
    "net_imposable" DOUBLE PRECISION NOT NULL,
    "ir_net" DOUBLE PRECISION NOT NULL,
    "net_payable" DOUBLE PRECISION NOT NULL,
    "employer_cost" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_exchange_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "commission_mode" TEXT NOT NULL DEFAULT 'PERCENT',
    "commission_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pricing_by_condition" JSONB NOT NULL,
    "label_prefix" TEXT NOT NULL DEFAULT 'BRS',
    "account_mapping" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_exchange_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_exchange_campaigns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "BookCampaignStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_exchange_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subject_id" UUID,
    "level_id" UUID,
    "editor" TEXT,
    "isbn" TEXT,
    "edition_year" INTEGER,
    "price_new" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "price_bourse_default" DOUBLE PRECISION,
    "photo_file_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_copies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "condition" "BookCondition" NOT NULL,
    "source" "BookCopySource" NOT NULL DEFAULT 'STUDENT_USED',
    "seller_id" UUID,
    "ask_price" DOUBLE PRECISION NOT NULL,
    "status" "BookCopyStatus" NOT NULL DEFAULT 'DEPOSITED',
    "buyer_id" UUID,
    "sale_price" DOUBLE PRECISION,
    "commission" DOUBLE PRECISION,
    "sold_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "refund_mode" "BookRefundMode",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "copy_id" UUID NOT NULL,
    "type" "BookTransactionType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "recorded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reconcilable" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "journal" "AccountingJournal" NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "reference" TEXT,
    "source_type" TEXT,
    "source_id" TEXT,
    "posted_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ice" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "number" TEXT,
    "label" TEXT NOT NULL,
    "account_code" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "note" TEXT,
    "recorded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "recorded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radiation_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "RadiationType" NOT NULL DEFAULT 'TRANSFERT',
    "reason" TEXT,
    "destination_school" TEXT,
    "status" "RadiationStatus" NOT NULL DEFAULT 'REQUESTED',
    "debt_cleared" BOOLEAN NOT NULL DEFAULT false,
    "note_requested" BOOLEAN NOT NULL DEFAULT false,
    "requested_by_user_id" UUID,
    "vie_scolaire_by_user_id" UUID,
    "compta_by_user_id" UUID,
    "direction_by_user_id" UUID,
    "vie_scolaire_comment" TEXT,
    "compta_comment" TEXT,
    "direction_comment" TEXT,
    "vie_scolaire_at" TIMESTAMP(3),
    "compta_at" TIMESTAMP(3),
    "docs_generated_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radiation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radiation_refunds" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "radiation_request_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING_CHECK',
    "basis" "RefundBasis" NOT NULL DEFAULT 'INSTALLMENT',
    "paid_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "consumed_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "computed_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approved_amount" DECIMAL(12,2),
    "method" "RefundMethod",
    "reference" TEXT,
    "breakdown" JSONB,
    "compta_by_user_id" UUID,
    "direction_by_user_id" UUID,
    "direction_comment" TEXT,
    "paid_by_user_id" UUID,
    "approved_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radiation_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_alerts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "related_type" TEXT,
    "related_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competency_frameworks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "FrameworkStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competency_frameworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competency_nodes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "framework_id" UUID NOT NULL,
    "parent_id" UUID,
    "kind" "CompetencyKind" NOT NULL,
    "label_fr" TEXT NOT NULL,
    "label_ar" TEXT,
    "descriptor" TEXT,
    "subject_id" UUID,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_leaf" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competency_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competency_node_levels" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,

    CONSTRAINT "competency_node_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastery_levels" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label_fr" TEXT NOT NULL,
    "label_ar" TEXT,
    "value" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#94a3b8',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mastery_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competency_assessments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "mastery_level_id" UUID NOT NULL,
    "comment" TEXT,
    "source" "AssessmentSource" NOT NULL DEFAULT 'CLASS',
    "support_session_id" UUID,
    "evaluated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competency_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competency_reports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "framework_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "disciplinary_rate" DOUBLE PRECISION,
    "transversal_rate" DOUBLE PRECISION,
    "generated_by_user_id" UUID,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competency_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_session_skills" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "support_session_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,

    CONSTRAINT "support_session_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "label_ar" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_subject_coefficients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "weekly_hours" DOUBLE PRECISION,
    "cc_coefficient" DOUBLE PRECISION,
    "certifying" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "track_subject_coefficients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "track_id" UUID,
    "cc_weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "semester_weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "regional_weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "national_weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grading_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "period_id" UUID,
    "label" TEXT NOT NULL,
    "label_ar" TEXT,
    "kind" "ExamKind" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "ExamSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "mix_classes" BOOLEAN NOT NULL DEFAULT true,
    "anonymized" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "closed_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_session_tracks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,

    CONSTRAINT "exam_session_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_papers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "max_value" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_room_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "exam_capacity" INTEGER NOT NULL,

    CONSTRAINT "exam_room_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_supervisors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "allocation_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "lead" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_supervisors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_seats" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "allocation_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "seat_number" INTEGER NOT NULL,
    "anonymous_code" TEXT,

    CONSTRAINT "exam_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_graders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "lot_from" INTEGER,
    "lot_to" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_graders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_marks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "value" DOUBLE PRECISION,
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "entered_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_blueprints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "type" "ExamPaperType" NOT NULL,
    "paper_group" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_blueprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_paper_tracks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,

    CONSTRAINT "exam_paper_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DiscountRuleFees" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_groups_slug_key" ON "tenant_groups"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_custom_domain_key" ON "tenants"("custom_domain");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_massar_code_key" ON "tenants"("massar_code");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_logo_file_id_key" ON "tenants"("logo_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_modules_tenant_id_code_key" ON "tenant_modules"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "user_tenants_user_id_idx" ON "user_tenants"("user_id");

-- CreateIndex
CREATE INDEX "user_tenants_tenant_id_idx" ON "user_tenants"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_tenants_user_id_tenant_id_key" ON "user_tenants"("user_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "persons_contract_file_id_key" ON "persons"("contract_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "persons_photo_file_id_key" ON "persons"("photo_file_id");

-- CreateIndex
CREATE INDEX "persons_tenant_id_type_idx" ON "persons"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "persons_tenant_id_last_name_first_name_idx" ON "persons"("tenant_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "persons_tenant_id_role_id_idx" ON "persons"("tenant_id", "role_id");

-- CreateIndex
CREATE INDEX "persons_tenant_id_contract_end_date_idx" ON "persons"("tenant_id", "contract_end_date");

-- CreateIndex
CREATE INDEX "persons_tenant_id_service_idx" ON "persons"("tenant_id", "service");

-- CreateIndex
CREATE INDEX "persons_tenant_id_service_id_idx" ON "persons"("tenant_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "persons_tenant_id_massar_id_key" ON "persons"("tenant_id", "massar_id");

-- CreateIndex
CREATE INDEX "teacher_specialties_tenant_id_teacher_id_idx" ON "teacher_specialties"("tenant_id", "teacher_id");

-- CreateIndex
CREATE INDEX "teacher_specialties_tenant_id_subject_id_idx" ON "teacher_specialties"("tenant_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_specialties_teacher_id_subject_id_key" ON "teacher_specialties"("teacher_id", "subject_id");

-- CreateIndex
CREATE INDEX "teacher_cycles_tenant_id_teacher_id_idx" ON "teacher_cycles"("tenant_id", "teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_cycles_teacher_id_cycle_id_key" ON "teacher_cycles"("teacher_id", "cycle_id");

-- CreateIndex
CREATE INDEX "teacher_priority_classes_tenant_id_teacher_id_idx" ON "teacher_priority_classes"("tenant_id", "teacher_id");

-- CreateIndex
CREATE INDEX "teacher_priority_classes_tenant_id_class_id_idx" ON "teacher_priority_classes"("tenant_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_priority_classes_teacher_id_class_id_key" ON "teacher_priority_classes"("teacher_id", "class_id");

-- CreateIndex
CREATE INDEX "diplomas_tenant_id_person_id_idx" ON "diplomas"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_tenant_id_teacher_id_idx" ON "teacher_assignments"("tenant_id", "teacher_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_tenant_id_class_id_academic_year_id_idx" ON "teacher_assignments"("tenant_id", "class_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_tenant_id_subject_id_idx" ON "teacher_assignments"("tenant_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_assignments_teacher_id_subject_id_class_id_academic_key" ON "teacher_assignments"("teacher_id", "subject_id", "class_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "person_roles_tenant_id_applies_to_order_idx" ON "person_roles"("tenant_id", "applies_to", "order");

-- CreateIndex
CREATE INDEX "person_roles_tenant_id_service_id_idx" ON "person_roles"("tenant_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_roles_tenant_id_code_key" ON "person_roles"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "services_tenant_id_order_idx" ON "services"("tenant_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "services_tenant_id_code_key" ON "services"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "person_relations_tenant_id_child_id_idx" ON "person_relations"("tenant_id", "child_id");

-- CreateIndex
CREATE INDEX "person_relations_tenant_id_parent_id_idx" ON "person_relations"("tenant_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_relations_child_id_parent_id_key" ON "person_relations"("child_id", "parent_id");

-- CreateIndex
CREATE INDEX "user_persons_tenant_id_idx" ON "user_persons"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_persons_user_id_person_id_key" ON "user_persons"("user_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_tenant_id_idx" ON "password_reset_tokens"("tenant_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_code_key" ON "roles"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "user_roles_tenant_id_idx" ON "user_roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_tenant_id_label_key" ON "academic_years"("tenant_id", "label");

-- CreateIndex
CREATE INDEX "periods_tenant_id_academic_year_id_idx" ON "periods"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "cycles_tenant_id_code_key" ON "cycles"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "levels_tenant_id_code_key" ON "levels"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "curriculum_subjects_tenant_id_level_id_idx" ON "curriculum_subjects"("tenant_id", "level_id");

-- CreateIndex
CREATE INDEX "curriculum_subjects_tenant_id_subject_id_idx" ON "curriculum_subjects"("tenant_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_subjects_level_id_subject_id_key" ON "curriculum_subjects"("level_id", "subject_id");

-- CreateIndex
CREATE INDEX "classes_tenant_id_level_id_idx" ON "classes"("tenant_id", "level_id");

-- CreateIndex
CREATE UNIQUE INDEX "classes_tenant_id_academic_year_id_name_key" ON "classes"("tenant_id", "academic_year_id", "name");

-- CreateIndex
CREATE INDEX "class_groups_tenant_id_class_id_idx" ON "class_groups"("tenant_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_groups_class_id_subject_id_name_key" ON "class_groups"("class_id", "subject_id", "name");

-- CreateIndex
CREATE INDEX "class_group_slots_class_id_subject_id_day_of_week_slot_id_idx" ON "class_group_slots"("class_id", "subject_id", "day_of_week", "slot_id");

-- CreateIndex
CREATE INDEX "class_group_slots_tenant_id_class_id_idx" ON "class_group_slots"("tenant_id", "class_id");

-- CreateIndex
CREATE INDEX "class_group_members_tenant_id_student_id_idx" ON "class_group_members"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_group_members_group_id_student_id_key" ON "class_group_members"("group_id", "student_id");

-- CreateIndex
CREATE INDEX "student_classes_tenant_id_class_id_idx" ON "student_classes"("tenant_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_classes_student_id_class_id_key" ON "student_classes"("student_id", "class_id");

-- CreateIndex
CREATE INDEX "rooms_tenant_id_primary_cycle_id_idx" ON "rooms"("tenant_id", "primary_cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_tenant_id_code_key" ON "rooms"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entity_type_entity_id_idx" ON "audit_logs"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "files_s3_key_key" ON "files"("s3_key");

-- CreateIndex
CREATE INDEX "files_tenant_id_owner_type_owner_id_idx" ON "files"("tenant_id", "owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_class_id_date_period_label_idx" ON "attendance_sessions"("class_id", "date", "period_label");

-- CreateIndex
CREATE INDEX "attendance_sessions_tenant_id_date_idx" ON "attendance_sessions"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "attendance_records_tenant_id_student_id_idx" ON "attendance_records"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_session_id_student_id_key" ON "attendance_records"("session_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_events_attendance_record_id_key" ON "attendance_events"("attendance_record_id");

-- CreateIndex
CREATE INDEX "attendance_events_tenant_id_status_idx" ON "attendance_events"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "attendance_events_tenant_id_date_idx" ON "attendance_events"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "attendance_reasons_tenant_id_idx" ON "attendance_reasons"("tenant_id");

-- CreateIndex
CREATE INDEX "staff_absence_reasons_tenant_id_idx" ON "staff_absence_reasons"("tenant_id");

-- CreateIndex
CREATE INDEX "staff_attendance_tenant_id_date_idx" ON "staff_attendance"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "staff_attendance_tenant_id_person_id_idx" ON "staff_attendance"("tenant_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_person_id_date_key" ON "staff_attendance"("person_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "absence_justifications_attendance_record_id_key" ON "absence_justifications"("attendance_record_id");

-- CreateIndex
CREATE INDEX "absence_justifications_tenant_id_status_idx" ON "absence_justifications"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenant_id_code_key" ON "subjects"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenant_id_label_key" ON "subjects"("tenant_id", "label");

-- CreateIndex
CREATE INDEX "evaluations_tenant_id_class_id_period_id_subject_id_idx" ON "evaluations"("tenant_id", "class_id", "period_id", "subject_id");

-- CreateIndex
CREATE INDEX "evaluations_exam_paper_id_idx" ON "evaluations"("exam_paper_id");

-- CreateIndex
CREATE INDEX "grades_tenant_id_student_id_idx" ON "grades"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "grades_evaluation_id_student_id_key" ON "grades"("evaluation_id", "student_id");

-- CreateIndex
CREATE INDEX "subject_appreciations_tenant_id_period_id_idx" ON "subject_appreciations"("tenant_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_appreciations_student_id_subject_id_period_id_key" ON "subject_appreciations"("student_id", "subject_id", "period_id");

-- CreateIndex
CREATE INDEX "carnet_entries_tenant_id_student_id_idx" ON "carnet_entries"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "carnet_entries_attendance_session_id_idx" ON "carnet_entries"("attendance_session_id");

-- CreateIndex
CREATE INDEX "appel_reminders_tenant_id_date_idx" ON "appel_reminders"("tenant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "appel_reminders_entry_id_date_key" ON "appel_reminders"("entry_id", "date");

-- CreateIndex
CREATE INDEX "council_entries_tenant_id_period_id_idx" ON "council_entries"("tenant_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "council_entries_class_id_period_id_student_id_key" ON "council_entries"("class_id", "period_id", "student_id");

-- CreateIndex
CREATE INDEX "enrollments_tenant_id_academic_year_id_status_idx" ON "enrollments"("tenant_id", "academic_year_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_tenant_id_class_id_idx" ON "enrollments"("tenant_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_id_academic_year_id_key" ON "enrollments"("student_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "admission_quotas_tenant_id_academic_year_id_idx" ON "admission_quotas"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_quotas_academic_year_id_level_id_key" ON "admission_quotas"("academic_year_id", "level_id");

-- CreateIndex
CREATE INDEX "required_documents_tenant_id_level_id_idx" ON "required_documents"("tenant_id", "level_id");

-- CreateIndex
CREATE UNIQUE INDEX "required_documents_tenant_id_code_key" ON "required_documents"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_documents_file_id_key" ON "enrollment_documents"("file_id");

-- CreateIndex
CREATE INDEX "enrollment_documents_tenant_id_enrollment_id_idx" ON "enrollment_documents"("tenant_id", "enrollment_id");

-- CreateIndex
CREATE INDEX "timetable_slots_tenant_id_order_idx" ON "timetable_slots"("tenant_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_tenant_id_start_time_end_time_key" ON "timetable_slots"("tenant_id", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "timetable_entries_class_id_academic_year_id_day_of_week_slo_idx" ON "timetable_entries"("class_id", "academic_year_id", "day_of_week", "slot_id");

-- CreateIndex
CREATE INDEX "timetable_entries_tenant_id_academic_year_id_day_of_week_sl_idx" ON "timetable_entries"("tenant_id", "academic_year_id", "day_of_week", "slot_id");

-- CreateIndex
CREATE INDEX "timetable_entries_tenant_id_teacher_id_idx" ON "timetable_entries"("tenant_id", "teacher_id");

-- CreateIndex
CREATE INDEX "timetable_entries_tenant_id_room_id_idx" ON "timetable_entries"("tenant_id", "room_id");

-- CreateIndex
CREATE INDEX "timetable_overrides_tenant_id_date_idx" ON "timetable_overrides"("tenant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_overrides_entry_id_date_key" ON "timetable_overrides"("entry_id", "date");

-- CreateIndex
CREATE INDEX "lesson_entries_tenant_id_class_id_date_idx" ON "lesson_entries"("tenant_id", "class_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_entries_entry_id_date_key" ON "lesson_entries"("entry_id", "date");

-- CreateIndex
CREATE INDEX "lesson_resources_tenant_id_lesson_entry_id_idx" ON "lesson_resources"("tenant_id", "lesson_entry_id");

-- CreateIndex
CREATE INDEX "homeworks_tenant_id_lesson_entry_id_idx" ON "homeworks"("tenant_id", "lesson_entry_id");

-- CreateIndex
CREATE INDEX "homeworks_tenant_id_due_date_idx" ON "homeworks"("tenant_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_constraints_tenant_id_kind_key" ON "timetable_constraints"("tenant_id", "kind");

-- CreateIndex
CREATE INDEX "announcements_tenant_id_published_at_idx" ON "announcements"("tenant_id", "published_at");

-- CreateIndex
CREATE INDEX "surveys_tenant_id_status_idx" ON "surveys"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "surveys_tenant_id_period_id_idx" ON "surveys"("tenant_id", "period_id");

-- CreateIndex
CREATE INDEX "survey_questions_tenant_id_survey_id_idx" ON "survey_questions"("tenant_id", "survey_id");

-- CreateIndex
CREATE INDEX "survey_responses_tenant_id_survey_id_idx" ON "survey_responses"("tenant_id", "survey_id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_responses_survey_id_submitted_by_id_key" ON "survey_responses"("survey_id", "submitted_by_id");

-- CreateIndex
CREATE INDEX "survey_answers_tenant_id_response_id_idx" ON "survey_answers"("tenant_id", "response_id");

-- CreateIndex
CREATE INDEX "survey_answers_tenant_id_question_id_idx" ON "survey_answers"("tenant_id", "question_id");

-- CreateIndex
CREATE INDEX "conversations_tenant_id_updated_at_idx" ON "conversations"("tenant_id", "updated_at");

-- CreateIndex
CREATE INDEX "conversation_participants_tenant_id_user_id_idx" ON "conversation_participants"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_user_id_key" ON "conversation_participants"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_sent_at_idx" ON "messages"("conversation_id", "sent_at");

-- CreateIndex
CREATE INDEX "support_courses_tenant_id_academic_year_id_idx" ON "support_courses"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "support_resources_tenant_id_support_course_id_idx" ON "support_resources"("tenant_id", "support_course_id");

-- CreateIndex
CREATE INDEX "support_resources_tenant_id_support_session_id_idx" ON "support_resources"("tenant_id", "support_session_id");

-- CreateIndex
CREATE INDEX "support_slots_tenant_id_support_course_id_idx" ON "support_slots"("tenant_id", "support_course_id");

-- CreateIndex
CREATE INDEX "support_enrollments_tenant_id_student_id_idx" ON "support_enrollments"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_enrollments_support_course_id_student_id_key" ON "support_enrollments"("support_course_id", "student_id");

-- CreateIndex
CREATE INDEX "support_sessions_tenant_id_date_idx" ON "support_sessions"("tenant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "support_sessions_support_course_id_date_key" ON "support_sessions"("support_course_id", "date");

-- CreateIndex
CREATE INDEX "support_attendance_tenant_id_student_id_idx" ON "support_attendance"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_attendance_session_id_student_id_key" ON "support_attendance"("session_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_schedules_tenant_id_academic_year_id_level_id_label_key" ON "fee_schedules"("tenant_id", "academic_year_id", "level_id", "label");

-- CreateIndex
CREATE INDEX "discount_rules_tenant_id_idx" ON "discount_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "installments_tenant_id_student_id_status_idx" ON "installments"("tenant_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "installments_tenant_id_due_date_idx" ON "installments"("tenant_id", "due_date");

-- CreateIndex
CREATE INDEX "payments_tenant_id_paid_at_idx" ON "payments"("tenant_id", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_tenant_id_user_id_idx" ON "device_tokens"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "online_payments_tenant_id_status_idx" ON "online_payments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "exceptional_fee_types_tenant_id_order_idx" ON "exceptional_fee_types"("tenant_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "exceptional_fee_types_tenant_id_label_fr_key" ON "exceptional_fee_types"("tenant_id", "label_fr");

-- CreateIndex
CREATE INDEX "exceptional_fees_tenant_id_status_idx" ON "exceptional_fees"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exceptional_fee_assignments_installment_id_key" ON "exceptional_fee_assignments"("installment_id");

-- CreateIndex
CREATE UNIQUE INDEX "exceptional_fee_assignments_refund_file_id_key" ON "exceptional_fee_assignments"("refund_file_id");

-- CreateIndex
CREATE INDEX "exceptional_fee_assignments_tenant_id_student_id_consent_idx" ON "exceptional_fee_assignments"("tenant_id", "student_id", "consent");

-- CreateIndex
CREATE UNIQUE INDEX "exceptional_fee_assignments_exceptional_fee_id_student_id_key" ON "exceptional_fee_assignments"("exceptional_fee_id", "student_id");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_date_idx" ON "expenses"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "payment_reminders_tenant_id_student_id_idx" ON "payment_reminders"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "transport_zones_tenant_id_idx" ON "transport_zones"("tenant_id");

-- CreateIndex
CREATE INDEX "buses_tenant_id_idx" ON "buses"("tenant_id");

-- CreateIndex
CREATE INDEX "transport_lines_tenant_id_idx" ON "transport_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "transport_stops_tenant_id_line_id_idx" ON "transport_stops"("tenant_id", "line_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_transports_student_id_key" ON "student_transports"("student_id");

-- CreateIndex
CREATE INDEX "student_transports_tenant_id_line_id_idx" ON "student_transports"("tenant_id", "line_id");

-- CreateIndex
CREATE INDEX "transport_attendance_sessions_tenant_id_date_idx" ON "transport_attendance_sessions"("tenant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "transport_attendance_sessions_line_id_date_direction_key" ON "transport_attendance_sessions"("line_id", "date", "direction");

-- CreateIndex
CREATE INDEX "transport_attendance_records_tenant_id_student_id_idx" ON "transport_attendance_records"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "transport_attendance_records_session_id_student_id_key" ON "transport_attendance_records"("session_id", "student_id");

-- CreateIndex
CREATE INDEX "notification_logs_tenant_id_created_at_idx" ON "notification_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "leave_types_tenant_id_idx" ON "leave_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_tenant_id_code_key" ON "leave_types"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_person_id_idx" ON "leave_requests"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_status_idx" ON "leave_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "overtime_entries_tenant_id_person_id_idx" ON "overtime_entries"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "overtime_entries_tenant_id_status_idx" ON "overtime_entries"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "payroll_configs_tenant_id_effective_from_idx" ON "payroll_configs"("tenant_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "employee_payroll_profiles_person_id_key" ON "employee_payroll_profiles"("person_id");

-- CreateIndex
CREATE INDEX "employee_payroll_profiles_tenant_id_idx" ON "employee_payroll_profiles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenant_id_year_month_key" ON "payroll_runs"("tenant_id", "year", "month");

-- CreateIndex
CREATE INDEX "payslips_tenant_id_person_id_idx" ON "payslips"("tenant_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_run_id_person_id_key" ON "payslips"("run_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "book_exchange_configs_tenant_id_key" ON "book_exchange_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "book_exchange_campaigns_tenant_id_idx" ON "book_exchange_campaigns"("tenant_id");

-- CreateIndex
CREATE INDEX "books_tenant_id_idx" ON "books"("tenant_id");

-- CreateIndex
CREATE INDEX "books_tenant_id_level_id_idx" ON "books"("tenant_id", "level_id");

-- CreateIndex
CREATE INDEX "book_copies_tenant_id_status_idx" ON "book_copies"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "book_copies_tenant_id_book_id_idx" ON "book_copies"("tenant_id", "book_id");

-- CreateIndex
CREATE UNIQUE INDEX "book_copies_tenant_id_code_key" ON "book_copies"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "book_transactions_tenant_id_created_at_idx" ON "book_transactions"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "fiscal_years_tenant_id_idx" ON "fiscal_years"("tenant_id");

-- CreateIndex
CREATE INDEX "accounts_tenant_id_idx" ON "accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenant_id_code_key" ON "accounts"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "journal_entries_tenant_id_journal_date_idx" ON "journal_entries"("tenant_id", "journal", "date");

-- CreateIndex
CREATE INDEX "journal_entries_tenant_id_source_type_source_id_idx" ON "journal_entries"("tenant_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "journal_lines_tenant_id_account_id_idx" ON "journal_lines"("tenant_id", "account_id");

-- CreateIndex
CREATE INDEX "journal_lines_entry_id_idx" ON "journal_lines"("entry_id");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_idx" ON "suppliers"("tenant_id");

-- CreateIndex
CREATE INDEX "supplier_invoices_tenant_id_status_idx" ON "supplier_invoices"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "supplier_invoices_tenant_id_due_date_idx" ON "supplier_invoices"("tenant_id", "due_date");

-- CreateIndex
CREATE INDEX "supplier_payments_tenant_id_invoice_id_idx" ON "supplier_payments"("tenant_id", "invoice_id");

-- CreateIndex
CREATE INDEX "radiation_requests_tenant_id_status_idx" ON "radiation_requests"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "radiation_refunds_radiation_request_id_key" ON "radiation_refunds"("radiation_request_id");

-- CreateIndex
CREATE INDEX "radiation_refunds_tenant_id_status_idx" ON "radiation_refunds"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "staff_alerts_tenant_id_user_id_read_at_idx" ON "staff_alerts"("tenant_id", "user_id", "read_at");

-- CreateIndex
CREATE INDEX "competency_frameworks_tenant_id_status_idx" ON "competency_frameworks"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "competency_frameworks_tenant_id_academic_year_id_version_key" ON "competency_frameworks"("tenant_id", "academic_year_id", "version");

-- CreateIndex
CREATE INDEX "competency_nodes_tenant_id_framework_id_kind_idx" ON "competency_nodes"("tenant_id", "framework_id", "kind");

-- CreateIndex
CREATE INDEX "competency_nodes_tenant_id_parent_id_idx" ON "competency_nodes"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "competency_node_levels_tenant_id_level_id_idx" ON "competency_node_levels"("tenant_id", "level_id");

-- CreateIndex
CREATE UNIQUE INDEX "competency_node_levels_node_id_level_id_key" ON "competency_node_levels"("node_id", "level_id");

-- CreateIndex
CREATE UNIQUE INDEX "mastery_levels_tenant_id_code_key" ON "mastery_levels"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "competency_assessments_tenant_id_period_id_node_id_idx" ON "competency_assessments"("tenant_id", "period_id", "node_id");

-- CreateIndex
CREATE INDEX "competency_assessments_tenant_id_student_id_period_id_idx" ON "competency_assessments"("tenant_id", "student_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "competency_assessments_student_id_node_id_period_id_evaluat_key" ON "competency_assessments"("student_id", "node_id", "period_id", "evaluated_by_user_id");

-- CreateIndex
CREATE INDEX "competency_reports_tenant_id_period_id_idx" ON "competency_reports"("tenant_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "competency_reports_student_id_period_id_key" ON "competency_reports"("student_id", "period_id");

-- CreateIndex
CREATE INDEX "support_session_skills_tenant_id_node_id_idx" ON "support_session_skills"("tenant_id", "node_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_session_skills_support_session_id_node_id_key" ON "support_session_skills"("support_session_id", "node_id");

-- CreateIndex
CREATE INDEX "tracks_tenant_id_level_id_idx" ON "tracks"("tenant_id", "level_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_tenant_id_code_key" ON "tracks"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "track_subject_coefficients_tenant_id_track_id_idx" ON "track_subject_coefficients"("tenant_id", "track_id");

-- CreateIndex
CREATE UNIQUE INDEX "track_subject_coefficients_track_id_subject_id_key" ON "track_subject_coefficients"("track_id", "subject_id");

-- CreateIndex
CREATE INDEX "grading_rules_tenant_id_academic_year_id_level_id_idx" ON "grading_rules"("tenant_id", "academic_year_id", "level_id");

-- CreateIndex
CREATE INDEX "exam_sessions_tenant_id_academic_year_id_level_id_idx" ON "exam_sessions"("tenant_id", "academic_year_id", "level_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_session_tracks_session_id_track_id_key" ON "exam_session_tracks"("session_id", "track_id");

-- CreateIndex
CREATE INDEX "exam_papers_tenant_id_session_id_idx" ON "exam_papers"("tenant_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_papers_session_id_subject_id_date_start_time_key" ON "exam_papers"("session_id", "subject_id", "date", "start_time");

-- CreateIndex
CREATE INDEX "exam_room_allocations_tenant_id_paper_id_idx" ON "exam_room_allocations"("tenant_id", "paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_room_allocations_paper_id_room_id_key" ON "exam_room_allocations"("paper_id", "room_id");

-- CreateIndex
CREATE INDEX "exam_supervisors_tenant_id_teacher_id_idx" ON "exam_supervisors"("tenant_id", "teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_supervisors_allocation_id_teacher_id_key" ON "exam_supervisors"("allocation_id", "teacher_id");

-- CreateIndex
CREATE INDEX "exam_seats_tenant_id_paper_id_idx" ON "exam_seats"("tenant_id", "paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_seats_paper_id_student_id_key" ON "exam_seats"("paper_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_seats_paper_id_anonymous_code_key" ON "exam_seats"("paper_id", "anonymous_code");

-- CreateIndex
CREATE INDEX "exam_graders_tenant_id_teacher_id_idx" ON "exam_graders"("tenant_id", "teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_graders_paper_id_teacher_id_key" ON "exam_graders"("paper_id", "teacher_id");

-- CreateIndex
CREATE INDEX "exam_marks_tenant_id_student_id_idx" ON "exam_marks"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_marks_paper_id_student_id_key" ON "exam_marks"("paper_id", "student_id");

-- CreateIndex
CREATE INDEX "exam_blueprints_tenant_id_track_id_idx" ON "exam_blueprints"("tenant_id", "track_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_blueprints_track_id_subject_id_key" ON "exam_blueprints"("track_id", "subject_id");

-- CreateIndex
CREATE INDEX "exam_paper_tracks_tenant_id_track_id_idx" ON "exam_paper_tracks"("tenant_id", "track_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_paper_tracks_paper_id_track_id_key" ON "exam_paper_tracks"("paper_id", "track_id");

-- CreateIndex
CREATE UNIQUE INDEX "_DiscountRuleFees_AB_unique" ON "_DiscountRuleFees"("A", "B");

-- CreateIndex
CREATE INDEX "_DiscountRuleFees_B_index" ON "_DiscountRuleFees"("B");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "tenant_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "person_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_contract_file_id_fkey" FOREIGN KEY ("contract_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_photo_file_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_specialties" ADD CONSTRAINT "teacher_specialties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_specialties" ADD CONSTRAINT "teacher_specialties_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_specialties" ADD CONSTRAINT "teacher_specialties_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_cycles" ADD CONSTRAINT "teacher_cycles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_cycles" ADD CONSTRAINT "teacher_cycles_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_cycles" ADD CONSTRAINT "teacher_cycles_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_priority_classes" ADD CONSTRAINT "teacher_priority_classes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_priority_classes" ADD CONSTRAINT "teacher_priority_classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_priority_classes" ADD CONSTRAINT "teacher_priority_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diplomas" ADD CONSTRAINT "diplomas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diplomas" ADD CONSTRAINT "diplomas_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_relations" ADD CONSTRAINT "person_relations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_relations" ADD CONSTRAINT "person_relations_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_relations" ADD CONSTRAINT "person_relations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_persons" ADD CONSTRAINT "user_persons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_persons" ADD CONSTRAINT "user_persons_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "levels" ADD CONSTRAINT "levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "levels" ADD CONSTRAINT "levels_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_subjects" ADD CONSTRAINT "curriculum_subjects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_subjects" ADD CONSTRAINT "curriculum_subjects_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_subjects" ADD CONSTRAINT "curriculum_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_main_teacher_id_fkey" FOREIGN KEY ("main_teacher_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_delegate_id_fkey" FOREIGN KEY ("delegate_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_group_slots" ADD CONSTRAINT "class_group_slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_group_slots" ADD CONSTRAINT "class_group_slots_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_group_slots" ADD CONSTRAINT "class_group_slots_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_group_slots" ADD CONSTRAINT "class_group_slots_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "timetable_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_group_slots" ADD CONSTRAINT "class_group_slots_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "class_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_group_members" ADD CONSTRAINT "class_group_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_group_members" ADD CONSTRAINT "class_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "class_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_group_members" ADD CONSTRAINT "class_group_members_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_classes" ADD CONSTRAINT "student_classes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_classes" ADD CONSTRAINT "student_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_primary_cycle_id_fkey" FOREIGN KEY ("primary_cycle_id") REFERENCES "cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "class_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_late_reason_id_fkey" FOREIGN KEY ("late_reason_id") REFERENCES "attendance_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_reasons" ADD CONSTRAINT "attendance_reasons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_absence_reasons" ADD CONSTRAINT "staff_absence_reasons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_absence_reason_id_fkey" FOREIGN KEY ("absence_reason_id") REFERENCES "staff_absence_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_justifications" ADD CONSTRAINT "absence_justifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_justifications" ADD CONSTRAINT "absence_justifications_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_exam_paper_id_fkey" FOREIGN KEY ("exam_paper_id") REFERENCES "exam_papers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_appreciations" ADD CONSTRAINT "subject_appreciations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_appreciations" ADD CONSTRAINT "subject_appreciations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carnet_entries" ADD CONSTRAINT "carnet_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carnet_entries" ADD CONSTRAINT "carnet_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carnet_entries" ADD CONSTRAINT "carnet_entries_attendance_session_id_fkey" FOREIGN KEY ("attendance_session_id") REFERENCES "attendance_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appel_reminders" ADD CONSTRAINT "appel_reminders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "council_entries" ADD CONSTRAINT "council_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "council_entries" ADD CONSTRAINT "council_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_quotas" ADD CONSTRAINT "admission_quotas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_quotas" ADD CONSTRAINT "admission_quotas_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_quotas" ADD CONSTRAINT "admission_quotas_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "required_documents" ADD CONSTRAINT "required_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "required_documents" ADD CONSTRAINT "required_documents_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_documents" ADD CONSTRAINT "enrollment_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_documents" ADD CONSTRAINT "enrollment_documents_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_documents" ADD CONSTRAINT "enrollment_documents_required_document_id_fkey" FOREIGN KEY ("required_document_id") REFERENCES "required_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_documents" ADD CONSTRAINT "enrollment_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "timetable_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "class_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_overrides" ADD CONSTRAINT "timetable_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_overrides" ADD CONSTRAINT "timetable_overrides_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "timetable_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_overrides" ADD CONSTRAINT "timetable_overrides_substitute_teacher_id_fkey" FOREIGN KEY ("substitute_teacher_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_overrides" ADD CONSTRAINT "timetable_overrides_substitute_room_id_fkey" FOREIGN KEY ("substitute_room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_overrides" ADD CONSTRAINT "timetable_overrides_substitute_subject_id_fkey" FOREIGN KEY ("substitute_subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_entries" ADD CONSTRAINT "lesson_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_entries" ADD CONSTRAINT "lesson_entries_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "timetable_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_entries" ADD CONSTRAINT "lesson_entries_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_lesson_entry_id_fkey" FOREIGN KEY ("lesson_entry_id") REFERENCES "lesson_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homeworks" ADD CONSTRAINT "homeworks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homeworks" ADD CONSTRAINT "homeworks_lesson_entry_id_fkey" FOREIGN KEY ("lesson_entry_id") REFERENCES "lesson_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_constraints" ADD CONSTRAINT "timetable_constraints_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "survey_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_resources" ADD CONSTRAINT "support_resources_support_course_id_fkey" FOREIGN KEY ("support_course_id") REFERENCES "support_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_resources" ADD CONSTRAINT "support_resources_support_session_id_fkey" FOREIGN KEY ("support_session_id") REFERENCES "support_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_slots" ADD CONSTRAINT "support_slots_support_course_id_fkey" FOREIGN KEY ("support_course_id") REFERENCES "support_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_enrollments" ADD CONSTRAINT "support_enrollments_support_course_id_fkey" FOREIGN KEY ("support_course_id") REFERENCES "support_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_support_course_id_fkey" FOREIGN KEY ("support_course_id") REFERENCES "support_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_attendance" ADD CONSTRAINT "support_attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "support_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_rules" ADD CONSTRAINT "discount_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_rules" ADD CONSTRAINT "discount_rules_fee_schedule_item_id_fkey" FOREIGN KEY ("fee_schedule_item_id") REFERENCES "fee_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptional_fee_types" ADD CONSTRAINT "exceptional_fee_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptional_fees" ADD CONSTRAINT "exceptional_fees_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptional_fees" ADD CONSTRAINT "exceptional_fees_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptional_fees" ADD CONSTRAINT "exceptional_fees_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "exceptional_fee_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptional_fee_assignments" ADD CONSTRAINT "exceptional_fee_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptional_fee_assignments" ADD CONSTRAINT "exceptional_fee_assignments_exceptional_fee_id_fkey" FOREIGN KEY ("exceptional_fee_id") REFERENCES "exceptional_fees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptional_fee_assignments" ADD CONSTRAINT "exceptional_fee_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptional_fee_assignments" ADD CONSTRAINT "exceptional_fee_assignments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_zones" ADD CONSTRAINT "transport_zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buses" ADD CONSTRAINT "buses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_lines" ADD CONSTRAINT "transport_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_lines" ADD CONSTRAINT "transport_lines_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_lines" ADD CONSTRAINT "transport_lines_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_lines" ADD CONSTRAINT "transport_lines_attendant_id_fkey" FOREIGN KEY ("attendant_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_stops" ADD CONSTRAINT "transport_stops_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_stops" ADD CONSTRAINT "transport_stops_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "transport_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_stops" ADD CONSTRAINT "transport_stops_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "transport_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transports" ADD CONSTRAINT "student_transports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transports" ADD CONSTRAINT "student_transports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transports" ADD CONSTRAINT "student_transports_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "transport_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transports" ADD CONSTRAINT "student_transports_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "transport_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transports" ADD CONSTRAINT "student_transports_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "transport_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_attendance_sessions" ADD CONSTRAINT "transport_attendance_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_attendance_sessions" ADD CONSTRAINT "transport_attendance_sessions_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "transport_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_attendance_records" ADD CONSTRAINT "transport_attendance_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_attendance_records" ADD CONSTRAINT "transport_attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "transport_attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_attendance_records" ADD CONSTRAINT "transport_attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_entries" ADD CONSTRAINT "overtime_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_entries" ADD CONSTRAINT "overtime_entries_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_configs" ADD CONSTRAINT "payroll_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payroll_profiles" ADD CONSTRAINT "employee_payroll_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payroll_profiles" ADD CONSTRAINT "employee_payroll_profiles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_exchange_configs" ADD CONSTRAINT "book_exchange_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_exchange_campaigns" ADD CONSTRAINT "book_exchange_campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "book_exchange_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_transactions" ADD CONSTRAINT "book_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_transactions" ADD CONSTRAINT "book_transactions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "book_exchange_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_transactions" ADD CONSTRAINT "book_transactions_copy_id_fkey" FOREIGN KEY ("copy_id") REFERENCES "book_copies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radiation_requests" ADD CONSTRAINT "radiation_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radiation_requests" ADD CONSTRAINT "radiation_requests_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radiation_requests" ADD CONSTRAINT "radiation_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radiation_refunds" ADD CONSTRAINT "radiation_refunds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radiation_refunds" ADD CONSTRAINT "radiation_refunds_radiation_request_id_fkey" FOREIGN KEY ("radiation_request_id") REFERENCES "radiation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radiation_refunds" ADD CONSTRAINT "radiation_refunds_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_alerts" ADD CONSTRAINT "staff_alerts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_alerts" ADD CONSTRAINT "staff_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_frameworks" ADD CONSTRAINT "competency_frameworks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_frameworks" ADD CONSTRAINT "competency_frameworks_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_nodes" ADD CONSTRAINT "competency_nodes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_nodes" ADD CONSTRAINT "competency_nodes_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "competency_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_nodes" ADD CONSTRAINT "competency_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "competency_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_nodes" ADD CONSTRAINT "competency_nodes_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_node_levels" ADD CONSTRAINT "competency_node_levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_node_levels" ADD CONSTRAINT "competency_node_levels_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "competency_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_node_levels" ADD CONSTRAINT "competency_node_levels_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_levels" ADD CONSTRAINT "mastery_levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_assessments" ADD CONSTRAINT "competency_assessments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_assessments" ADD CONSTRAINT "competency_assessments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_assessments" ADD CONSTRAINT "competency_assessments_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "competency_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_assessments" ADD CONSTRAINT "competency_assessments_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_assessments" ADD CONSTRAINT "competency_assessments_mastery_level_id_fkey" FOREIGN KEY ("mastery_level_id") REFERENCES "mastery_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_assessments" ADD CONSTRAINT "competency_assessments_support_session_id_fkey" FOREIGN KEY ("support_session_id") REFERENCES "support_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_reports" ADD CONSTRAINT "competency_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_reports" ADD CONSTRAINT "competency_reports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_reports" ADD CONSTRAINT "competency_reports_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_reports" ADD CONSTRAINT "competency_reports_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "competency_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_session_skills" ADD CONSTRAINT "support_session_skills_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_session_skills" ADD CONSTRAINT "support_session_skills_support_session_id_fkey" FOREIGN KEY ("support_session_id") REFERENCES "support_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_session_skills" ADD CONSTRAINT "support_session_skills_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "competency_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_subject_coefficients" ADD CONSTRAINT "track_subject_coefficients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_subject_coefficients" ADD CONSTRAINT "track_subject_coefficients_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_subject_coefficients" ADD CONSTRAINT "track_subject_coefficients_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_rules" ADD CONSTRAINT "grading_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_rules" ADD CONSTRAINT "grading_rules_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_rules" ADD CONSTRAINT "grading_rules_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_rules" ADD CONSTRAINT "grading_rules_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_session_tracks" ADD CONSTRAINT "exam_session_tracks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_session_tracks" ADD CONSTRAINT "exam_session_tracks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_session_tracks" ADD CONSTRAINT "exam_session_tracks_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_room_allocations" ADD CONSTRAINT "exam_room_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_room_allocations" ADD CONSTRAINT "exam_room_allocations_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_room_allocations" ADD CONSTRAINT "exam_room_allocations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_supervisors" ADD CONSTRAINT "exam_supervisors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_supervisors" ADD CONSTRAINT "exam_supervisors_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "exam_room_allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_supervisors" ADD CONSTRAINT "exam_supervisors_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_seats" ADD CONSTRAINT "exam_seats_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_seats" ADD CONSTRAINT "exam_seats_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_seats" ADD CONSTRAINT "exam_seats_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "exam_room_allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_seats" ADD CONSTRAINT "exam_seats_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_graders" ADD CONSTRAINT "exam_graders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_graders" ADD CONSTRAINT "exam_graders_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_graders" ADD CONSTRAINT "exam_graders_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_blueprints" ADD CONSTRAINT "exam_blueprints_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_blueprints" ADD CONSTRAINT "exam_blueprints_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_blueprints" ADD CONSTRAINT "exam_blueprints_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_paper_tracks" ADD CONSTRAINT "exam_paper_tracks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_paper_tracks" ADD CONSTRAINT "exam_paper_tracks_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_paper_tracks" ADD CONSTRAINT "exam_paper_tracks_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DiscountRuleFees" ADD CONSTRAINT "_DiscountRuleFees_A_fkey" FOREIGN KEY ("A") REFERENCES "discount_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DiscountRuleFees" ADD CONSTRAINT "_DiscountRuleFees_B_fkey" FOREIGN KEY ("B") REFERENCES "fee_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

