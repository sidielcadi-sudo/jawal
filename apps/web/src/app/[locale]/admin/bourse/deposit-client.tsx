'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { addCopyAction } from './deposit-actions';

type Book = { id: string; title: string; priceNew: number; priceBourseDefault: number | null };
const CONDITIONS = ['NEW', 'VERY_GOOD', 'GOOD', 'FAIR'] as const;
const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

export function AddCopyForm({
  campaignId,
  sellerId,
  books,
  factors,
}: {
  campaignId: string;
  sellerId: string;
  books: Book[];
  factors: Record<string, number>;
}) {
  const t = useTranslations('admin.bourse');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [bookId, setBookId] = useState('');
  const [condition, setCondition] = useState<string>('GOOD');
  const [price, setPrice] = useState('');
  const [err, setErr] = useState('');

  function autoPrice(bId: string, cond: string) {
    const b = books.find((x) => x.id === bId);
    if (!b) return;
    const p = b.priceBourseDefault ?? Math.round(b.priceNew * (factors[cond] ?? 0.5) * 100) / 100;
    setPrice(String(p));
  }

  function submit() {
    if (!bookId) { setErr(t('bookRequired')); return; }
    setErr('');
    const fd = new FormData();
    fd.set('campaignId', campaignId);
    fd.set('sellerId', sellerId);
    fd.set('bookId', bookId);
    fd.set('condition', condition);
    if (price) fd.set('askPrice', price);
    start(async () => {
      const r = await addCopyAction(fd);
      if (!r.ok) return setErr(r.error);
      setBookId(''); setPrice('');
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
      <select value={bookId} onChange={(e) => { setBookId(e.target.value); autoPrice(e.target.value, condition); }} className={`${input} md:col-span-2`}>
        <option value="">{t('selectBook')}</option>
        {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
      </select>
      <select value={condition} onChange={(e) => { setCondition(e.target.value); autoPrice(bookId, e.target.value); }} className={input}>
        {CONDITIONS.map((c) => <option key={c} value={c}>{t(`condition.${c}`)}</option>)}
      </select>
      <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="any" placeholder={t('price')} className={input} />
      <div className="md:col-span-4">
        <button onClick={submit} disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{t('addCopy')}</button>
        {err && <span className="ms-2 text-xs text-red-700">{err}</span>}
      </div>
    </div>
  );
}
