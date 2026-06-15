import 'server-only';
import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

/**
 * Transport SMTP partagé. En dev : Mailpit (localhost:1025, sans auth).
 * En prod : SES/Resend/etc via les variables d'env.
 */
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: parseInt(process.env.SMTP_PORT ?? '1025', 10),
    secure: false,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
  });
  return transporter;
}

const FROM = process.env.SMTP_FROM ?? 'Jawal <no-reply@jawal.local>';

export type EmailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Mail.Attachment[];
};

export async function sendEmail(opts: EmailOptions) {
  const t = getTransporter();
  return t.sendMail({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments,
  });
}

/**
 * Helper pour les notifications d'absence aux parents.
 * Tolère l'échec : on log et on continue (ne doit pas casser la finalisation).
 */
export async function safeSendEmail(opts: EmailOptions) {
  try {
    await sendEmail(opts);
    return { ok: true as const };
  } catch (e) {
    console.error('[email] échec envoi', e);
    return { ok: false as const, error: e instanceof Error ? e.message : 'send failed' };
  }
}
