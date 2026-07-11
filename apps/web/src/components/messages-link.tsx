'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { unreadMessagesCountAction } from '@/app/[locale]/admin/alerts-actions';

/**
 * Icône enveloppe (messages) avec pastille de non-lus. La pastille est
 * recalculée à chaque changement d'URL — indispensable car le compteur est
 * rendu dans le layout, que l'App Router ne re-rend pas lors d'une navigation
 * interne (le badge ne disparaissait pas après lecture d'un message).
 */
export function MessagesLink({
  href,
  label,
  initialCount,
}: {
  href: string;
  label: string;
  initialCount: number;
}) {
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    let alive = true;
    unreadMessagesCountAction()
      .then((n) => {
        if (alive) setCount(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  return (
    <Link
      href={href}
      aria-label={label}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
