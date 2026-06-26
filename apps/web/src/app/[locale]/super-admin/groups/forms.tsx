'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createGroupAction, setTenantGroupAction, grantSiteAccessAction, revokeSiteAccessAction } from './actions';

type Tenant = { id: string; name: string; slug: string; groupId: string | null };
type Group = { id: string; name: string };

const inputCls =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function RevokeAccessButton({ userId, tenantId }: { userId: string; tenantId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  function revoke() {
    if (!window.confirm('Retirer l’accès de ce compte à ce site ?')) return;
    setError('');
    start(async () => {
      const r = await revokeSiteAccessAction(userId, tenantId);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  return (
    <span className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-red-700">{error}</span>}
      <button
        type="button"
        onClick={revoke}
        disabled={pending}
        className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        Retirer
      </button>
    </span>
  );
}

export function CreateGroupForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    setError('');
    start(async () => {
      const r = await createGroupAction(fd);
      if (!r.ok) return setError(r.error);
      form.reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input name="name" required placeholder="Nom du groupe" className={`w-full ${inputCls}`} />
      <input name="slug" required placeholder="slug-du-groupe" className={`w-full ${inputCls}`} />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? '…' : 'Créer le groupe'}
      </button>
    </form>
  );
}

export function AttachTenantControl({
  tenantId,
  groupId,
  groups,
}: {
  tenantId: string;
  groupId: string | null;
  groups: Group[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const fd = new FormData();
    fd.set('tenantId', tenantId);
    fd.set('groupId', e.target.value);
    start(async () => {
      await setTenantGroupAction(fd);
      router.refresh();
    });
  }

  return (
    <select defaultValue={groupId ?? ''} onChange={onChange} disabled={pending} className={inputCls}>
      <option value="">— Aucun —</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
}

export function GrantAccessForm({ tenants }: { tenants: Tenant[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  // Seuls les sites rattachés à un groupe sont éligibles.
  const grouped = tenants.filter((t) => t.groupId);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError('');
    setOk('');
    start(async () => {
      const r = await grantSiteAccessAction(fd);
      if (!r.ok) return setError(r.error);
      setOk(r.message ?? 'Accès accordé.');
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="block text-xs font-medium text-slate-600">
        Site « home » du compte
        <select name="homeTenantId" required className={`mt-1 w-full ${inputCls}`}>
          <option value="">—</option>
          {grouped.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.slug})
            </option>
          ))}
        </select>
      </label>
      <input name="email" type="email" required placeholder="email@du-compte" className={`w-full ${inputCls}`} />
      <label className="block text-xs font-medium text-slate-600">
        Site cible à autoriser
        <select name="targetTenantId" required className={`mt-1 w-full ${inputCls}`}>
          <option value="">—</option>
          {grouped.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.slug})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Rôle sur le site cible
        <select name="roleCode" required defaultValue="tenant_admin" className={`mt-1 w-full ${inputCls}`}>
          <option value="tenant_admin">tenant_admin</option>
          <option value="direction">direction</option>
        </select>
      </label>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {ok && <p className="text-xs text-emerald-700">{ok}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? '…' : "Accorder l'accès"}
      </button>
    </form>
  );
}
