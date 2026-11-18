"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import VariantPreview from "@/components/teacher/VariantPreview";
import ImportQuestionsDialog from "@/components/teacher/ImportQuestionsDialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VariableRow {
  id: string; // local UI id
  name: string;
  min: string;
  max: string;
}

interface ConstraintRow {
  id: string; // local UI id
  expression: string;
}

interface RenderedOption {
  key: string;
  text: string;
  isCorrect: boolean;
}

interface ItemVariant {
  id: string;
  questionId: string;
  variableValues: Record<string, number>;
  renderedText: string;
  renderedOptions: RenderedOption[];
  correctOptionKey: string;
  tauMinSeconds: number;
  calibrationStatus: "EXPERT_ESTIMATED" | "CALIBRATING" | "VALIDATED";
  hasPotentialIssue: boolean;
  createdAt: string;
}

interface Question {
  id: string;
  testId: string;
  templateText: string;
  itemOrder: number;
  createdAt: string;
  _count?: { variants: number };
}

interface TestInfo {
  id: string;
  topic: string;
  class: { name: string; grade: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Build the canonical template text from parts.
 * Template body + metadata lines for variables and constraints.
 */
function buildTemplateText(
  bodyText: string,
  variables: VariableRow[],
  constraints: ConstraintRow[]
): string {
  const validVars = variables.filter(
    (v) => v.name.trim() && v.min !== "" && v.max !== ""
  );
  const validConstraints = constraints.filter((c) => c.expression.trim());

  const lines: string[] = [bodyText.trim()];

  if (validVars.length > 0) {
    const varStr = validVars
      .map((v) => `${v.name.trim()}[${v.min}..${v.max}]`)
      .join(", ");
    lines.push(`\n# variables: ${varStr}`);
  }

  if (validConstraints.length > 0) {
    const constraintStr = validConstraints.map((c) => c.expression.trim()).join(", ");
    lines.push(`# constraints: ${constraintStr}`);
  }

  return lines.join("\n");
}

// ─── Live Preview of template body ───────────────────────────────────────────

function LivePreview({ bodyText }: { bodyText: string }) {
  // Highlight {{var}} placeholders in the body text
  const parts = bodyText.split(/(\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\})/g);

  return (
    <div
      className="min-h-[60px] p-3 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-800 leading-relaxed"
      aria-label="Preview template soal"
    >
      {bodyText.trim() === "" ? (
        <span className="text-gray-400 italic">Preview akan muncul di sini...</span>
      ) : (
        parts.map((part, i) => {
          if (/^\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}$/.test(part)) {
            return (
              <mark
                key={i}
                className="bg-yellow-200 text-yellow-900 px-1 rounded font-mono"
                aria-label={`Variabel ${part.slice(2, -2)}`}
              >
                {part}
              </mark>
            );
          }
          return <span key={i}>{part}</span>;
        })
      )}
    </div>
  );
}

// ─── Text Option Row ──────────────────────────────────────────────────────────

interface TextOptionRow {
  key: "A" | "B" | "C" | "D";
  text: string;
}

// ─── Question Form Panel ──────────────────────────────────────────────────────

function QuestionFormPanel({
  testId,
  onSaved,
  onCancel,
}: {
  testId: string;
  onSaved: (question: Question, variants: ItemVariant[]) => void;
  onCancel: () => void;
}) {
  const [questionType, setQuestionType] = useState<"numeric" | "text">("numeric");
  const [bodyText, setBodyText] = useState("");
  const [variables, setVariables] = useState<VariableRow[]>([
    { id: uid(), name: "a", min: "2", max: "50" },
    { id: uid(), name: "b", min: "2", max: "50" },
  ]);
  const [constraints, setConstraints] = useState<ConstraintRow[]>([
    { id: uid(), expression: "a < b" },
  ]);
  const [textOptions, setTextOptions] = useState<TextOptionRow[]>([
    { key: "A", text: "" },
    { key: "B", text: "" },
    { key: "C", text: "" },
    { key: "D", text: "" },
  ]);
  const [correctKey, setCorrectKey] = useState<"A" | "B" | "C" | "D" | null>(null);

  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  // Derived: full template text (for validation feedback)
  const fullTemplate = buildTemplateText(bodyText, variables, constraints);

  function addVariable() {
    setVariables((prev) => [...prev, { id: uid(), name: "", min: "2", max: "50" }]);
  }

  function removeVariable(id: string) {
    setVariables((prev) => prev.filter((v) => v.id !== id));
  }

  function updateVariable(id: string, field: keyof Omit<VariableRow, "id">, value: string) {
    setVariables((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  }

  function addConstraint() {
    setConstraints((prev) => [...prev, { id: uid(), expression: "" }]);
  }

  function removeConstraint(id: string) {
    setConstraints((prev) => prev.filter((c) => c.id !== id));
  }

  function updateConstraint(id: string, value: string) {
    setConstraints((prev) =>
      prev.map((c) => (c.id === id ? { ...c, expression: value } : c))
    );
  }

  async function handleSave() {
    setParseError(null);
    setGenError(null);
    setLoading(true);

    try {
      let body: Record<string, unknown>;

      if (questionType === "text") {
        body = {
          templateText: bodyText.trim(),
          questionType: "text",
          textOptions: textOptions.map((opt) => ({
            key: opt.key,
            text: opt.text,
            isCorrect: opt.key === correctKey,
          })),
        };
      } else {
        body = { templateText: fullTemplate };
      }

      const res = await fetch(`/api/tests/${testId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = await res.json();

      if (!result.success) {
        setParseError(result.error?.message ?? "Gagal menyimpan soal.");
        return;
      }

      if (result.data.generationError) {
        setGenError(result.data.generationError);
      }

      onSaved(result.data.question, result.data.variants ?? []);
    } catch {
      setParseError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  const canSave =
    questionType === "text"
      ? bodyText.trim() !== "" &&
        textOptions.every((opt) => opt.text.trim() !== "") &&
        correctKey !== null
      : bodyText.trim() !== "" &&
        variables.some((v) => v.name.trim() && v.min !== "" && v.max !== "");

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 space-y-5">
      <h2 className="text-base font-semibold text-gray-900">Tambah Soal Baru</h2>

      {/* Question type toggle */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Tipe Soal</p>
        <div className="flex gap-2" role="group" aria-label="Pilih tipe soal">
          <button
            type="button"
            onClick={() => setQuestionType("numeric")}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium border transition-colors min-h-[40px]",
              questionType === "numeric"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600"
            )}
            aria-pressed={questionType === "numeric"}
          >
            Numerik
          </button>
          <button
            type="button"
            onClick={() => setQuestionType("text")}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium border transition-colors min-h-[40px]",
              questionType === "text"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600"
            )}
            aria-pressed={questionType === "text"}
          >
            Teks
          </button>
        </div>
      </div>

      {/* Template body */}
      <div>
        <label
          htmlFor="template-body"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Teks Soal{" "}
          <span aria-hidden="true" className="text-red-500">*</span>
        </label>
        {questionType === "numeric" && (
          <p className="text-xs text-gray-500 mb-2">
            Gunakan <code className="bg-gray-100 px-1 rounded">{"{{a}}"}</code> untuk variabel.
            Contoh: <em>Budi punya {"{{a}}"} kelereng, Andi punya {"{{b}}"} kelereng. Berapa KPK dari {"{{a}}"} dan {"{{b}}"}?</em>
          </p>
        )}
        <textarea
          id="template-body"
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={4}
          placeholder={
            questionType === "text"
              ? "Contoh: Mana yang merupakan bilangan prima?"
              : "Budi punya {{a}} kelereng dan Andi punya {{b}} kelereng. Berapa KPK dari {{a}} dan {{b}}?"
          }
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          aria-required="true"
          aria-describedby="template-hint"
        />
        <p id="template-hint" className="sr-only">
          {questionType === "text"
            ? "Tulis teks pertanyaan soal pilihan ganda"
            : "Gunakan kurung kurawal ganda untuk menandai variabel, contoh kurung kurawal a kurung kurawal"}
        </p>
      </div>

      {/* Live preview (numeric only) */}
      {questionType === "numeric" && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Preview Template
          </p>
          <LivePreview bodyText={bodyText} />
        </div>
      )}

      {/* Variables section — numeric only */}
      {questionType === "numeric" && (
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">
            Definisi Variabel
          </label>
          <button
            type="button"
            onClick={addVariable}
            className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded min-h-[32px]"
          >
            + Tambah Variabel
          </button>
        </div>

        <div className="space-y-2" role="list" aria-label="Daftar variabel">
          {variables.map((v) => (
            <div
              key={v.id}
              role="listitem"
              className="flex items-center gap-2 p-2 bg-gray-50 rounded-md border border-gray-200"
            >
              {/* Variable name */}
              <input
                type="text"
                value={v.name}
                onChange={(e) => updateVariable(v.id, "name", e.target.value)}
                placeholder="nama"
                aria-label="Nama variabel"
                className="w-16 border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[36px]"
              />
              <span className="text-gray-400 text-sm">∈</span>
              {/* Min */}
              <input
                type="number"
                value={v.min}
                onChange={(e) => updateVariable(v.id, "min", e.target.value)}
                placeholder="min"
                aria-label={`Nilai minimum variabel ${v.name}`}
                className="w-16 border border-gray-300 rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[36px]"
              />
              <span className="text-gray-400 text-sm">...</span>
              {/* Max */}
              <input
                type="number"
                value={v.max}
                onChange={(e) => updateVariable(v.id, "max", e.target.value)}
                placeholder="max"
                aria-label={`Nilai maksimum variabel ${v.name}`}
                className="w-16 border border-gray-300 rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[36px]"
              />
              {/* Rendered hint */}
              {v.name && v.min !== "" && v.max !== "" && (
                <code className="text-xs text-gray-500 flex-1 font-mono">
                  # {v.name}[{v.min}..{v.max}]
                </code>
              )}
              <button
                type="button"
                onClick={() => removeVariable(v.id)}
                className="ml-auto text-gray-400 hover:text-red-500 px-1.5 py-1 rounded min-h-[32px]"
                aria-label={`Hapus variabel ${v.name || "(kosong)"}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Constraints section — numeric only */}
      {questionType === "numeric" && (
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">
            Constraints{" "}
            <span className="text-xs text-gray-400 font-normal">(opsional)</span>
          </label>
          <button
            type="button"
            onClick={addConstraint}
            className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded min-h-[32px]"
          >
            + Tambah Constraint
          </button>
        </div>

        <div className="space-y-2" role="list" aria-label="Daftar constraint">
          {constraints.length === 0 && (
            <p className="text-xs text-gray-400 italic">Tidak ada constraint.</p>
          )}
          {constraints.map((c) => (
            <div
              key={c.id}
              role="listitem"
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={c.expression}
                onChange={(e) => updateConstraint(c.id, e.target.value)}
                placeholder="Contoh: a < b  atau  lcm(a,b) <= 100"
                aria-label="Ekspresi constraint"
                className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[36px]"
              />
              <button
                type="button"
                onClick={() => removeConstraint(c.id)}
                className="text-gray-400 hover:text-red-500 px-1.5 py-1 rounded min-h-[32px]"
                aria-label="Hapus constraint ini"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Text options — text type only */}
      {questionType === "text" && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">
            Opsi Jawaban{" "}
            <span aria-hidden="true" className="text-red-500">*</span>
          </p>
          <div className="space-y-3" role="list" aria-label="Daftar opsi jawaban">
            {textOptions.map((opt) => (
              <div
                key={opt.key}
                role="listitem"
                className="flex items-center gap-3"
              >
                <input
                  type="radio"
                  name="correct-answer"
                  id={`correct-${opt.key}`}
                  checked={correctKey === opt.key}
                  onChange={() => setCorrectKey(opt.key)}
                  className="flex-shrink-0 w-4 h-4 text-blue-600 cursor-pointer"
                  aria-label={`Tandai opsi ${opt.key} sebagai jawaban benar`}
                />
                <label
                  htmlFor={`option-text-${opt.key}`}
                  className="flex-shrink-0 w-7 text-sm font-semibold text-gray-700"
                >
                  {opt.key}.
                </label>
                <input
                  type="text"
                  id={`option-text-${opt.key}`}
                  value={opt.text}
                  onChange={(e) =>
                    setTextOptions((prev) =>
                      prev.map((o) => (o.key === opt.key ? { ...o, text: e.target.value } : o))
                    )
                  }
                  placeholder={`Teks opsi ${opt.key}`}
                  aria-label={`Teks opsi ${opt.key}`}
                  className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[36px]"
                />
                {correctKey === opt.key && (
                  <span className="text-xs text-green-600 font-medium flex-shrink-0" aria-live="polite">
                    ✓ Benar
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Klik tombol radio di sebelah kiri untuk menandai jawaban benar.
          </p>
        </div>
      )}

      {/* Generated template preview — numeric only */}
      {questionType === "numeric" && bodyText.trim() && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <p className="text-xs font-medium text-blue-700 mb-1">Template yang akan disimpan:</p>
          <pre className="text-xs text-blue-800 whitespace-pre-wrap font-mono leading-relaxed">
            {fullTemplate}
          </pre>
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
          <p className="font-medium">Kesalahan template:</p>
          <p className="mt-0.5">{parseError}</p>
        </div>
      )}

      {/* Generation warning */}
      {genError && (
        <div role="alert" className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
          <p className="font-medium">⚠ Peringatan generate varian:</p>
          <p className="mt-0.5">{genError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 min-h-[48px]"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !canSave}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium text-white min-h-[48px] transition-colors",
            canSave && !loading
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-blue-300 cursor-not-allowed"
          )}
        >
          {loading ? "Menyimpan & Generating..." : "💾 Simpan & Generate Variant"}
        </button>
      </div>
    </div>
  );
}

// ─── Question List Item ───────────────────────────────────────────────────────

function QuestionListItem({
  question,
  index,
  onDelete,
}: {
  question: Question;
  index: number;
  onDelete: (id: string) => void;
}) {
  const [showVariants, setShowVariants] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    const res = await fetch(`/api/questions/${question.id}`, { method: "DELETE" });
    const result = await res.json();
    if (result.success) onDelete(question.id);
  }

  // Extract first 120 chars of template body (strip metadata lines)
  const preview = question.templateText
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join(" ")
    .trim()
    .slice(0, 120);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <span
          className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center"
          aria-label={`Soal nomor ${index + 1}`}
        >
          {index + 1}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 leading-relaxed font-mono">
            {preview}{preview.length < question.templateText.length ? "..." : ""}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {question._count?.variants ?? 0} varian tersedia
          </p>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowVariants((v) => !v)}
            className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded min-h-[36px]"
            aria-expanded={showVariants}
          >
            {showVariants ? "Sembunyikan" : "Lihat Varian"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded min-h-[36px] transition-colors",
              deleteConfirm
                ? "bg-red-600 text-white hover:bg-red-700"
                : "text-red-500 hover:bg-red-50"
            )}
            aria-label={`Hapus soal ${index + 1}`}
          >
            {deleteConfirm ? "Konfirmasi" : "Hapus"}
          </button>
        </div>
      </div>

      {showVariants && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          <VariantPreview questionId={question.id} />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QuestionsPage({
  params,
}: {
  params: { testId: string };
}) {
  const { testId } = params;

  const [testInfo, setTestInfo] = useState<TestInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Track newly saved question+variants to show preview immediately
  const [savedVariants, setSavedVariants] = useState<Record<string, ItemVariant[]>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [testRes, questionsRes] = await Promise.all([
        fetch(`/api/tests/${testId}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/tests/${testId}/questions`).then((r) => r.json()),
      ]);

      if (testRes?.success) {
        setTestInfo(testRes.data);
      }

      if (questionsRes.success) {
        setQuestions(questionsRes.data);
      } else {
        setError(questionsRes.error?.message ?? "Gagal memuat soal.");
      }
    } catch {
      setError("Gagal memuat data. Periksa koneksi Anda.");
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleQuestionSaved(question: Question, variants: ItemVariant[]) {
    setQuestions((prev) => [
      ...prev,
      { ...question, _count: { variants: variants.length } },
    ]);
    setSavedVariants((prev) => ({ ...prev, [question.id]: variants }));
    setShowForm(false);
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <Link
          href="/dashboard/tests"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 mb-3"
        >
          ← Kembali ke Paket Soal
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Question Builder</h1>
            {testInfo && (
              <p className="text-sm text-gray-500 mt-1">
                Topik: <strong>{testInfo.topic}</strong> &middot; Kelas:{" "}
                <strong>
                  {testInfo.class.grade} — {testInfo.class.name}
                </strong>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors min-h-[40px]"
            aria-label="Import soal dari file CSV"
          >
            <span aria-hidden="true">⬆</span>
            Import CSV
          </button>
        </div>
      </div>

      {/* Import CSV dialog */}
      {showImport && (
        <ImportQuestionsDialog
          testId={testId}
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false);
            loadData();
          }}
        />
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3" aria-live="polite">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <p className="font-medium">Terjadi kesalahan</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            type="button"
            onClick={loadData}
            className="mt-2 text-sm underline"
          >
            Coba lagi
          </button>
        </div>
      )}

      {/* Question list */}
      {!loading && !error && (
        <>
          {questions.length === 0 && !showForm && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3" aria-hidden="true">📝</p>
              <p className="text-lg font-medium">Belum ada soal</p>
              <p className="text-sm mt-1">Klik tombol di bawah untuk menambah soal pertama.</p>
            </div>
          )}

          <div className="space-y-3 mb-4">
            {questions.map((q, idx) => (
              <QuestionListItem
                key={q.id}
                question={
                  savedVariants[q.id]
                    ? { ...q, _count: { variants: savedVariants[q.id].length } }
                    : q
                }
                index={idx}
                onDelete={(id) => setQuestions((prev) => prev.filter((x) => x.id !== id))}
              />
            ))}
          </div>

          {/* Show form or "add" button */}
          {showForm ? (
            <QuestionFormPanel
              testId={testId}
              onSaved={handleQuestionSaved}
              onCancel={() => setShowForm(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors min-h-[56px]"
            >
              <span aria-hidden="true" className="text-base">+</span>
              Tambah Soal Baru
            </button>
          )}
        </>
      )}
    </div>
  );
}
