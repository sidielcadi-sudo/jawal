'use client';

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700"
    >
      🖨 {label}
    </button>
  );
}
