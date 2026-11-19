
-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "map_question_id" INTEGER,
ADD COLUMN     "require_explanation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "session_pins" ADD COLUMN     "research_consent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "responses" ADD COLUMN     "explanation" TEXT;

-- CreateTable
CREATE TABLE "ml_diagnoses" (
    "id" TEXT NOT NULL,
    "session_pin_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "question_id" TEXT,
    "school_id" TEXT NOT NULL,
    "quadrant_probs" JSONB NOT NULL,
    "quadrant" TEXT NOT NULL,
    "mastery_prob" DOUBLE PRECISION NOT NULL,
    "misconception_label" TEXT,
    "misconception_prob" DOUBLE PRECISION,
    "hidden_misconception" BOOLEAN NOT NULL DEFAULT false,
    "prediction_set" JSONB NOT NULL,
    "deferred" BOOLEAN NOT NULL DEFAULT false,
    "reasons" JSONB NOT NULL,
    "rule_status" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml_feedback" (
    "id" TEXT NOT NULL,
    "ml_diagnosis_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "new_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ml_diagnoses_session_pin_id_student_id_question_id_key" ON "ml_diagnoses"("session_pin_id", "student_id", "question_id");

-- AddForeignKey
ALTER TABLE "ml_diagnoses" ADD CONSTRAINT "ml_diagnoses_session_pin_id_fkey" FOREIGN KEY ("session_pin_id") REFERENCES "session_pins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml_diagnoses" ADD CONSTRAINT "ml_diagnoses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml_diagnoses" ADD CONSTRAINT "ml_diagnoses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml_feedback" ADD CONSTRAINT "ml_feedback_ml_diagnosis_id_fkey" FOREIGN KEY ("ml_diagnosis_id") REFERENCES "ml_diagnoses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

