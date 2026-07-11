'use client';

import { useParams } from 'next/navigation';

/**
 * UI partagée des error boundaries de portail. Traduit une `ForbiddenError`
 * (digest « FORBIDDEN ») en « Opération non autorisée » ; sinon message
 * générique. Rendu par les `error.tsx` de chaque segment.
 */
export function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ locale: string }>();
  const ar = params?.locale === 'ar';
  const forbidden = error?.digest === 'FORBIDDEN' || /autoris/i.test(error?.message ?? '');

  const title = forbidden
    ? ar ? 'عملية غير مسموح بها' : 'Opération non autorisée'
    : ar ? 'حدث خطأ' : 'Une erreur est survenue';
  const desc = forbidden
    ? ar
      ? 'ليست لديكم الصلاحيات اللازمة للقيام بهذه العملية.'
      : "Vous n'avez pas les droits nécessaires pour effectuer cette opération."
    : ar
      ? 'يرجى إعادة المحاولة.'
      : 'Veuillez réessayer.';
  const retry = ar ? 'إعادة المحاولة' : 'Réessayer';

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${forbidden ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {forbidden ? (
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="m5.6 5.6 12.8 12.8" />
              </>
            ) : (
              <>
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <circle cx="12" cy="12" r="9" />
              </>
            )}
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{desc}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {retry}
        </button>
      </div>
    </div>
  );
}
