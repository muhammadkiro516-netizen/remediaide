-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TeacherRole" AS ENUM ('TEACHER', 'PRINCIPAL', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('LOCKED', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "CalibrationStatus" AS ENUM ('EXPERT_ESTIMATED', 'CALIBRATING', 'VALIDATED');

-- CreateEnum
CREATE TYPE "PerItemStatus" AS ENUM ('PAHAM_KONSEP', 'LUCKY_GUESS', 'MISKONSEPSI', 'TIDAK_PAHAM', 'INVALID');

-- CreateEnum
CREATE TYPE "FinalStatus" AS ENUM ('PAHAM_KONSEP', 'LUCKY_GUESS', 'MISKONSEPSI', 'TIDAK_PAHAM', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "ExitTicketStatus" AS ENUM ('UNUSED', 'USED');

-- CreateTable
CREATE TABLE "schools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "TeacherRole" NOT NULL DEFAULT 'TEACHER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "academic_year" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "anonymous_label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tests" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL DEFAULT 900,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "template_text" TEXT NOT NULL,
    "template_ast" JSONB NOT NULL,
    "variable_definitions" JSONB NOT NULL,
    "constraints" JSONB NOT NULL,
    "item_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_variants" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "variable_values" JSONB NOT NULL,
    "rendered_text" TEXT NOT NULL,
    "rendered_options" JSONB NOT NULL,
    "correct_option_key" TEXT NOT NULL,
    "tau_min_seconds" INTEGER NOT NULL,
    "calibration_status" "CalibrationStatus" NOT NULL DEFAULT 'EXPERT_ESTIMATED',
    "has_potential_issue" BOOLEAN NOT NULL DEFAULT false,
    "usage_stats" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_pins" (
    "id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "pin_code" TEXT NOT NULL,
    "state" "SessionState" NOT NULL DEFAULT 'LOCKED',
    "started_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "pin_fallback_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responses" (
    "id" TEXT NOT NULL,
    "session_pin_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "item_variant_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "chosen_option_key" TEXT NOT NULL,
    "cri_value" INTEGER NOT NULL,
    "response_time_ms" INTEGER NOT NULL,
    "integrity_index" DECIMAL(4,3) NOT NULL,
    "is_below_threshold" BOOLEAN NOT NULL DEFAULT false,
    "per_item_status" "PerItemStatus" NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concept_diagnoses" (
    "id" TEXT NOT NULL,
    "session_pin_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "final_status" "FinalStatus" NOT NULL,
    "voting_tally" JSONB NOT NULL,
    "tiebreaker_applied" BOOLEAN NOT NULL DEFAULT false,
    "valid_item_count" INTEGER NOT NULL,
    "manually_overridden" BOOLEAN NOT NULL DEFAULT false,
    "diagnosed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concept_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remedial_groups" (
    "id" TEXT NOT NULL,
    "session_pin_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "cognitive_status" "FinalStatus" NOT NULL,
    "member_labels" JSONB NOT NULL,
    "prescription" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remedial_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calibration_configs" (
    "id" TEXT NOT NULL,
    "min_sessions_for_calibrating" INTEGER NOT NULL DEFAULT 5,
    "min_responses_for_calibrating" INTEGER NOT NULL DEFAULT 50,
    "min_sessions_for_validated" INTEGER NOT NULL DEFAULT 10,
    "min_responses_for_validated" INTEGER NOT NULL DEFAULT 100,
    "max_std_dev_for_validated" DECIMAL(4,3) NOT NULL DEFAULT 0.15,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calibration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_wipe_logs" (
    "id" TEXT NOT NULL,
    "session_pin_id" TEXT NOT NULL,
    "confirmed_by" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "records_deleted" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_wipe_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_ticket_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "session_pin_id" TEXT NOT NULL,
    "remedial_group_id" TEXT,
    "school_id" TEXT NOT NULL,
    "status" "ExitTicketStatus" NOT NULL DEFAULT 'UNUSED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "exit_ticket_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_ticket_submissions" (
    "id" TEXT NOT NULL,
    "exit_ticket_token_id" TEXT NOT NULL,
    "reflection_text" VARCHAR(1000) NOT NULL,
    "confidence_score" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "school_id" TEXT NOT NULL,

    CONSTRAINT "exit_ticket_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schools_subdomain_key" ON "schools"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_email_key" ON "teachers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "students_anonymous_label_key" ON "students"("anonymous_label");

-- CreateIndex
CREATE UNIQUE INDEX "session_pins_pin_code_key" ON "session_pins"("pin_code");

-- CreateIndex
CREATE UNIQUE INDEX "responses_session_pin_id_student_id_item_variant_id_key" ON "responses"("session_pin_id", "student_id", "item_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "concept_diagnoses_session_pin_id_student_id_question_id_key" ON "concept_diagnoses"("session_pin_id", "student_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "auto_wipe_logs_session_pin_id_key" ON "auto_wipe_logs"("session_pin_id");

-- CreateIndex
CREATE UNIQUE INDEX "exit_ticket_tokens_token_key" ON "exit_ticket_tokens"("token");

-- CreateIndex
CREATE INDEX "exit_ticket_tokens_session_pin_id_idx" ON "exit_ticket_tokens"("session_pin_id");

-- CreateIndex
CREATE UNIQUE INDEX "exit_ticket_submissions_exit_ticket_token_id_key" ON "exit_ticket_submissions"("exit_ticket_token_id");

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_pins" ADD CONSTRAINT "session_pins_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_session_pin_id_fkey" FOREIGN KEY ("session_pin_id") REFERENCES "session_pins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_item_variant_id_fkey" FOREIGN KEY ("item_variant_id") REFERENCES "item_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_diagnoses" ADD CONSTRAINT "concept_diagnoses_session_pin_id_fkey" FOREIGN KEY ("session_pin_id") REFERENCES "session_pins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_diagnoses" ADD CONSTRAINT "concept_diagnoses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_diagnoses" ADD CONSTRAINT "concept_diagnoses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remedial_groups" ADD CONSTRAINT "remedial_groups_session_pin_id_fkey" FOREIGN KEY ("session_pin_id") REFERENCES "session_pins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_wipe_logs" ADD CONSTRAINT "auto_wipe_logs_session_pin_id_fkey" FOREIGN KEY ("session_pin_id") REFERENCES "session_pins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_wipe_logs" ADD CONSTRAINT "auto_wipe_logs_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_ticket_tokens" ADD CONSTRAINT "exit_ticket_tokens_session_pin_id_fkey" FOREIGN KEY ("session_pin_id") REFERENCES "session_pins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_ticket_tokens" ADD CONSTRAINT "exit_ticket_tokens_remedial_group_id_fkey" FOREIGN KEY ("remedial_group_id") REFERENCES "remedial_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_ticket_tokens" ADD CONSTRAINT "exit_ticket_tokens_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_ticket_submissions" ADD CONSTRAINT "exit_ticket_submissions_exit_ticket_token_id_fkey" FOREIGN KEY ("exit_ticket_token_id") REFERENCES "exit_ticket_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_ticket_submissions" ADD CONSTRAINT "exit_ticket_submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

