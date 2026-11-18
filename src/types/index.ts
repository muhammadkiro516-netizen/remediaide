// RemediAide — Shared Type Definitions
// Re-exports all shared types. Specific type definitions will be added in subsequent tasks.

// ─── Cognitive Status ─────────────────────────────────────────────────────────
export type CognitiveStatus =
  | "PAHAM_KONSEP"
  | "LUCKY_GUESS"
  | "MISKONSEPSI"
  | "TIDAK_PAHAM"
  | "INVALID"
  | "INSUFFICIENT_DATA";

// ─── Session State ─────────────────────────────────────────────────────────────
export type SessionState = "LOCKED" | "ACTIVE" | "CLOSED";

// ─── User Roles ────────────────────────────────────────────────────────────────
export type UserRole = "TEACHER" | "PRINCIPAL" | "STUDENT";

// ─── Calibration Status ────────────────────────────────────────────────────────
export type CalibrationStatus =
  | "EXPERT_ESTIMATED"
  | "CALIBRATING"
  | "VALIDATED";

// ─── Per-Item Status ───────────────────────────────────────────────────────────
export type PerItemStatus =
  | "PAHAM_KONSEP"
  | "LUCKY_GUESS"
  | "MISKONSEPSI"
  | "TIDAK_PAHAM"
  | "INVALID";

// ─── Final Diagnosis Status ────────────────────────────────────────────────────
export type FinalStatus =
  | "PAHAM_KONSEP"
  | "LUCKY_GUESS"
  | "MISKONSEPSI"
  | "TIDAK_PAHAM"
  | "INSUFFICIENT_DATA";

// ─── API Response Wrapper ──────────────────────────────────────────────────────
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

// ─── Diagnostic Engine Types (will be expanded in Task 4) ─────────────────────
export interface ResponseInput {
  itemId: string;
  isCorrect: boolean;
  criValue: number; // 0–5 integer
  responseTimeMs: number; // milliseconds
  tauMinMs: number; // threshold in milliseconds
}

export interface DiagnosisResult {
  itemId: string;
  status: CognitiveStatus;
  integrityIndex: number; // I_i ∈ [0.0, 1.0]
  isBelowThreshold: boolean;
  auditTrail: {
    criNormalized: number;
    timeRatio: number;
    classificationRule: string;
  };
}

export interface AggregationResult {
  finalStatus: CognitiveStatus;
  votingTally: Record<string, number>;
  tiebreakerApplied: boolean;
  validItemCount: number;
}

// ─── Heatmap Types (will be expanded in Task 10) ──────────────────────────────
export type SubmissionStatus = "NOT_SUBMITTED" | "PARTIAL" | "COMPLETE";

export interface HeatmapEntry {
  anonymousLabel: string;
  submissionStatus: SubmissionStatus;
  cognitiveStatus?: CognitiveStatus;
}

// ─── Template Parser Types (will be expanded in Task 6) ───────────────────────
export type ASTNode =
  | { type: "text"; value: string }
  | { type: "placeholder"; name: string };

export interface TemplateAST {
  nodes: ASTNode[];
  variables: VariableDefinition[];
  constraints: ConstraintExpression[];
}

export interface VariableDefinition {
  name: string;
  min: number;
  max: number;
}

export interface ConstraintExpression {
  expression: string;
  rawText: string;
}

// ─── Auth / Session Types (Task 3) ────────────────────────────────────────────

/** Roles that a teacher-type user can have */
export type TeacherRole = "TEACHER" | "PRINCIPAL" | "SUPERADMIN";

/**
 * Decoded session data for an authenticated Guru / Kepala Sekolah.
 * Stored in the JWT and returned by `getTeacherSession`.
 */
export interface TeacherSession {
  userId: string;
  schoolId: string;
  role: TeacherRole;
  name: string;
  email: string;
}

/**
 * Decoded session data for an authenticated Siswa (PIN-based).
 * Stored in the JWT and returned by `getStudentSession`.
 */
export interface StudentSession {
  studentId: string;
  sessionPinId: string;
  schoolId: string;
  anonymousLabel: string;
}
