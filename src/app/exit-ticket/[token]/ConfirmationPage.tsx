/**
 * ConfirmationPage — Success message after submission
 *
 * Shows different messages based on whether this is:
 *  - A fresh submission (alreadySubmitted=false, default)
 *  - A duplicate attempt (alreadySubmitted=true)
 */

'use client';

interface ConfirmationPageProps {
  alreadySubmitted?: boolean;
}

export default function ConfirmationPage({
  alreadySubmitted = false,
}: ConfirmationPageProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-6xl">✅</div>
        <h1 className="text-xl font-semibold text-gray-900">
          {alreadySubmitted ? 'Sudah Tercatat' : 'Terima Kasih!'}
        </h1>
        <p className="text-gray-600">
          {alreadySubmitted
            ? 'Refleksimu sudah tercatat sebelumnya. Terima kasih!'
            : 'Terima kasih, refleksimu sudah tersimpan!'}
        </p>
      </div>
    </div>
  );
}
