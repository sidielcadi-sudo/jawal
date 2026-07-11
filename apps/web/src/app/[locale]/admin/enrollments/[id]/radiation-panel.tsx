'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  requestRadiationAction,
  validateVieScolaireAction,
  validateComptaAction,
  approveRadiationAction,
  rejectRadiationAction,
} from '../radiation-actions';

type Req = {
  id: string;
  type: string;
  status: string;
  reason: string | null;
  destinationSchool: string | null;
  debtCleared: boolean;
  noteRequested: boolean;
  vieScolaireComment: string | null;
  comptaComment: string | null;
  directionComment: string | null;
  rejectionReason: string | null;
} | null;

const STEPS = ['REQUESTED', 'VIE_SCOLAIRE_OK', 'COMPTA_OK', 'APPROVED'] as const;
const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

export function RadiationPanel({
  enrollmentId,
  request,
  roleCodes,
  studentId,
  academicYearId,
}: {
  enrollmentId: string;
  request: Req;
  roleCodes: string[];
  studentId: string;
  academicYearId: string;
}) {
  const t = useTranslations('admin.enrollments.radiation');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const [type, setType] = useState('TRANSFERT');
  const [reason, setReason] = useState('');
  const [dest, setDest] = useState('');
  const [note, setNote] = useState(false);
  const [comment, setComment] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const has = (r: string) => roleCodes.includes(r) || roleCodes.includes('tenant_admin');
  const canVieScolaire = has('cpe');
  const canCompta = has('comptable');
  const canDirection = has('direction');
  const canRequest = canVieScolaire || canDirection || roleCodes.includes('scolarite');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr('');
    start(async () => {
      const r = await fn();
      if (!r.ok) return setErr(r.error ?? 'Erreur');
      setComment('');
      setRejecting(false);
      setRejectReason('');
      router.refresh();
    });
  }

  // Pas de demande en cours, ou dernière demande refusée → formulaire de (re)demande.
  // Une radiation refusée pour un motif peut être réexaminée : le parent/l'agent
  // peut relancer la procédure.
  const wasRejected = request?.status === 'REJECTED';
  if (!request || wasRejected) {
    if (!canRequest) {
      // Afficher au moins le motif du refus si on ne peut pas relancer.
      return wasRejected ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-700">{t('title')}</h2>
          <p className="text-xs text-red-700">{t('rejected')}{request?.rejectionReason ? ` — ${request.rejectionReason}` : ''}</p>
        </section>
      ) : null;
    }
    return (
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">{t('title')}</h2>
        {wasRejected && (
          <p className="mb-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
            {t('rejected')}{request?.rejectionReason ? ` — ${request.rejectionReason}` : ''} · {t('reexamine')}
          </p>
        )}
        <p className="mb-3 text-xs text-slate-500">{t('hint')}</p>
        <div className="flex flex-wrap items-end gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className={input}>
            <option value="TRANSFERT">{t('type.TRANSFERT')}</option>
            <option value="DEPART">{t('type.DEPART')}</option>
            <option value="AUTRE">{t('type.AUTRE')}</option>
          </select>
          {type === 'TRANSFERT' && <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder={t('destination')} className={input} />}
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('reason')} className={`${input} flex-1`} />
          <button disabled={pending} onClick={() => run(() => requestRadiationAction({ enrollmentId, type, reason, destinationSchool: dest, noteRequested: note }))} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{t('request')}</button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} />
          {t('noteRequested')}
        </label>
        {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
      </section>
    );
  }

  const stepIdx = STEPS.indexOf(request.status as (typeof STEPS)[number]);
  const rejected = request.status === 'REJECTED';
  const approved = request.status === 'APPROVED';

  // Responsable de l'étape active ?
  const activeAllowed =
    (request.status === 'REQUESTED' && canVieScolaire) ||
    (request.status === 'VIE_SCOLAIRE_OK' && canCompta) ||
    (request.status === 'COMPTA_OK' && canDirection);

  const stepComments: { key: 'vieScolaire' | 'compta' | 'direction'; value: string | null }[] = [
    { key: 'vieScolaire', value: request.vieScolaireComment },
    { key: 'compta', value: request.comptaComment },
    { key: 'direction', value: request.directionComment },
  ];

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{t('title')} — {t(`type.${request.type}`)}</h2>
      </div>

      {/* Stepper */}
      <ol className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        {(['vieScolaire', 'compta', 'direction'] as const).map((s, i) => {
          const done = stepIdx > i;
          const cur = stepIdx === i && !rejected && !approved;
          return (
            <li key={s} className={`rounded-full px-2.5 py-1 font-medium ${done ? 'bg-emerald-100 text-emerald-700' : cur ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
              {done ? '✓ ' : ''}{t(`step.${s}`)}
            </li>
          );
        })}
        {approved && <li className="rounded-full bg-brand-100 px-2.5 py-1 font-medium text-brand-700">{t('approved')}</li>}
        {rejected && <li className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-700">{t('rejected')}</li>}
      </ol>

      {/* Commentaires des étapes validées */}
      {stepComments.some((c) => c.value) && (
        <ul className="mb-3 space-y-1 text-xs text-slate-600">
          {stepComments.filter((c) => c.value).map((c) => (
            <li key={c.key} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
              <span className="font-medium text-slate-700">{t(`step.${c.key}`)} :</span> {c.value}
            </li>
          ))}
        </ul>
      )}

      {request.status === 'COMPTA_OK' && canDirection && (
        <p className={`mb-2 text-xs ${request.debtCleared ? 'text-emerald-600' : 'text-amber-600'}`}>{request.debtCleared ? t('noDebt') : t('hasDebt')}</p>
      )}

      {/* Étape active */}
      {!rejected && !approved && (
        activeAllowed ? (
          <div className="space-y-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('comment')}
              rows={2}
              className={`${input} w-full`}
            />
            <div className="flex flex-wrap items-center gap-2">
              {request.status === 'REQUESTED' && <Btn label={t('validateVieScolaire')} onClick={() => run(() => validateVieScolaireAction(request.id, comment))} pending={pending} />}
              {request.status === 'VIE_SCOLAIRE_OK' && <Btn label={t('validateCompta')} onClick={() => run(() => validateComptaAction(request.id, comment))} pending={pending} />}
              {request.status === 'COMPTA_OK' && <Btn label={t('approve')} onClick={() => run(() => approveRadiationAction(request.id, comment))} pending={pending} tone="emerald" />}
              {canDirection && !rejecting && (
                <button disabled={pending} onClick={() => setRejecting(true)} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">{t('reject')}</button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs italic text-slate-400">{t('waiting')}</p>
        )
      )}

      {/* Refus (direction) */}
      {rejecting && !rejected && !approved && (
        <div className="mt-2 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder={t('rejectReason')} rows={2} className={`${input} w-full`} />
          <div className="flex gap-2">
            <button disabled={pending || !rejectReason.trim()} onClick={() => run(() => rejectRadiationAction(request.id, rejectReason))} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">{t('reject')}</button>
            <button disabled={pending} onClick={() => setRejecting(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">✕</button>
          </div>
        </div>
      )}

      {/* Documents générés (à l'approbation) */}
      {approved && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h3 className="mb-2 text-xs font-semibold text-slate-700">{t('documents')}</h3>
          <div className="flex flex-wrap gap-2">
            <DocLink href={`/api/admin/persons/${studentId}/document.pdf?type=CERTIFICAT_SCOLARITE&year=${academicYearId}`} label={t('docScolarite')} />
            <DocLink href={`/api/admin/radiation/${request.id}/certificate.pdf`} label={t('certificate')} />
            {request.noteRequested && <DocLink href={`/api/admin/persons/${studentId}/bulletin.pdf?year=${academicYearId}`} label={t('docBulletin')} />}
          </div>
        </div>
      )}

      {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
    </section>
  );
}

function DocLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
      {label}
    </a>
  );
}

function Btn({ label, onClick, pending, tone }: { label: string; onClick: () => void; pending: boolean; tone?: string }) {
  return (
    <button disabled={pending} onClick={onClick} className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${tone === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-brand-600 hover:bg-brand-700'}`}>{label}</button>
  );
}
