/**
 * ErrorPage — Static error display for invalid/expired tokens
 *
 * Two error types:
 *  - NOT_FOUND: Token invalid or expired
 *  - DATA_NOT_FOUND: Token valid but missing required data
 */

interface ErrorPageProps {
  type: 'NOT_FOUND' | 'DATA_NOT_FOUND';
}

export default function ErrorPage({ type }: ErrorPageProps) {
  const messages = {
    NOT_FOUND: 'Link ini tidak valid atau sudah tidak berlaku.',
    DATA_NOT_FOUND: 'Data refleksi tidak ditemukan. Hubungi gurumu.',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-6xl">⚠️</div>
        <h1 className="text-xl font-semibold text-gray-900">
          Oops!
        </h1>
        <p className="text-gray-600">
          {messages[type]}
        </p>
      </div>
    </div>
  );
}
