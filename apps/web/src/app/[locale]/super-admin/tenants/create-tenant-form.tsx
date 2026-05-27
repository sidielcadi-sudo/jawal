'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTenantAction } from './actions';

export function CreateTenantForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function onSubmit(formData: FormData) {
    setError('');
    setSuccess('');
    startTransition(async () => {
      const result = await createTenantAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(`Établissement « ${result.tenant!.name} » créé.`);
      router.refresh();
      (document.getElementById('create-tenant-form') as HTMLFormElement | null)?.reset();
    });
  }

  return (
    <form id="create-tenant-form" action={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="name" className="block text-xs font-medium text-slate-700">
          Nom
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          minLength={2}
          placeholder="Lycée Al Massira"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div>
        <label htmlFor="slug" className="block text-xs font-medium text-slate-700">
          Slug
        </label>
        <input
          id="slug"
          name="slug"
          type="text"
          required
          pattern="[a-z0-9-]+"
          minLength={3}
          maxLength={40}
          placeholder="al-massira"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <p className="mt-1 text-xs text-slate-500">
          Sous-domaine : <span className="font-mono">[slug].jawal.app</span>
        </p>
      </div>

      <div>
        <label htmlFor="profile" className="block text-xs font-medium text-slate-700">
          Profil
        </label>
        <select
          id="profile"
          name="profile"
          required
          defaultValue="K12"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="K12">K-12 (primaire/secondaire)</option>
          <option value="SUPERIEUR">Enseignement supérieur</option>
          <option value="FORMATION_PRO">Formation professionnelle</option>
          <option value="MIXED">Multi-segments</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? 'Création…' : 'Créer'}
      </button>
    </form>
  );
}
