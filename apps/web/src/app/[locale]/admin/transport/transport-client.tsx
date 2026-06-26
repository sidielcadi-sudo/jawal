'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type ActResult = { ok: boolean; error?: string };

/** Formulaire générique : appelle une server action(FormData), affiche l'erreur, reset + refresh. */
export function CreateForm({
  action,
  className,
  children,
}: {
  action: (fd: FormData) => Promise<ActResult>;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setErr('');
        start(async () => {
          const r = await action(fd);
          if (!r.ok) return setErr(r.error ?? 'Erreur');
          ref.current?.reset();
          router.refresh();
        });
      }}
      className={className}
      data-pending={pending}
    >
      {children}
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
    </form>
  );
}

/** Bouton de suppression (server action déjà liée à l'id via .bind). */
export function DeleteButton({
  onDelete,
  label = '✕',
  confirmText = 'Supprimer ?',
}: {
  onDelete: () => Promise<ActResult>;
  label?: string;
  confirmText?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(confirmText)) return;
        start(async () => {
          await onDelete();
          router.refresh();
        });
      }}
      className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
      title={confirmText}
    >
      {label}
    </button>
  );
}
