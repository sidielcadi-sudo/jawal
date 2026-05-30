'use server';

import { validateEnrollmentAction, withdrawEnrollmentAction } from './actions';

/**
 * Wrappers void-returning pour les <form action={...}> côté RSC.
 * Le HTML <form action> exige (FormData) => Promise<void>, alors que nos
 * actions retournent un Result discriminé pour les usages programmatiques.
 */
export async function validateEnrollmentFormAction(formData: FormData): Promise<void> {
  await validateEnrollmentAction(formData);
}

export async function withdrawEnrollmentFormAction(formData: FormData): Promise<void> {
  await withdrawEnrollmentAction(formData);
}
