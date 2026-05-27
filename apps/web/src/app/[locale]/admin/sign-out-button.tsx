'use client';

import { signOut } from 'next-auth/react';

export function SignOutButton({ label, locale }: { label: string; locale: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
    >
      {label}
    </button>
  );
}
