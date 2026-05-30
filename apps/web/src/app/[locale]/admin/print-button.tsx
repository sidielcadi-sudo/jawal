'use client';

export function PrintButton({ labelPrint }: { labelPrint: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 print:hidden"
    >
      🖨 {labelPrint}
    </button>
  );
}
