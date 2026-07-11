'use client';

import { PortalError } from '@/components/portal-error';

export default function LocaleError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PortalError {...props} />;
}
