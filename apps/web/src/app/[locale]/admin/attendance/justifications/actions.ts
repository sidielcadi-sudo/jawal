'use server';

import { reviewJustificationAction } from '../../classes/[id]/attendance/justification-actions';

/**
 * Wrapper void-returning pour le rendu côté React Server Components.
 * Le HTML <form action={...}> exige une signature (FormData) => Promise<void>.
 */
export async function reviewJustificationFormAction(formData: FormData): Promise<void> {
  await reviewJustificationAction(formData);
}
