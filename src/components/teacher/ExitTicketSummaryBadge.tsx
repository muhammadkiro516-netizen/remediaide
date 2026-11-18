/**
 * ExitTicketSummaryBadge — Displays submission count for a remedial group
 *
 * Shows:
 *  - Nothing if no tokens have been generated (totalTokens === 0)
 *  - "Belum ada yang submit" if no submissions yet
 *  - "X dari Y kelompok sudah submit" if submissions exist
 */

interface ExitTicketSummaryBadgeProps {
  submittedCount: number;
  totalTokens: number;
}

export function ExitTicketSummaryBadge({
  submittedCount,
  totalTokens,
}: ExitTicketSummaryBadgeProps) {
  // No tokens generated yet → don't show anything
  if (totalTokens === 0) return null;

  // No submissions yet
  if (submittedCount === 0) {
    return (
      <p className="text-xs text-gray-400 mt-2">
        Belum ada yang submit Exit Ticket
      </p>
    );
  }

  // Submissions exist
  return (
    <p className="text-xs text-gray-600 mt-2">
      <span className="font-semibold text-green-700">{submittedCount}</span>
      {' '}dari {totalTokens} kelompok sudah submit Exit Ticket
    </p>
  );
}
