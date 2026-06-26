import { signOutAction } from '@/lib/sign-out-action';

export function SignOutButton({
  label,
  locale,
  className = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50',
}: {
  label: string;
  locale: string;
  className?: string;
}) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
