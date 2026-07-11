import { prismaAdmin } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Retour navigateur après paiement CMI (okUrl / failUrl — POST, parfois GET).
 * Purement informatif : redirige le parent vers l'échéancier avec un statut.
 * L'enregistrement réel du règlement est fait par le callback signé, pas ici.
 */
async function handle(req: Request) {
  let params: Record<string, string> = {};
  if (req.method === 'POST') {
    const form = await req.formData();
    for (const [k, v] of form.entries()) params[k] = typeof v === 'string' ? v : '';
  } else {
    params = Object.fromEntries(new URL(req.url).searchParams.entries());
  }

  const oid = params.oid ?? params.ReturnOid ?? '';
  const procReturnCode = params.ProcReturnCode ?? '';
  const response = (params.Response ?? '').toLowerCase();
  const ok = procReturnCode === '00' || response === 'approved';

  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  let dest = `${base}/fr/parent`;
  if (oid) {
    const order = await prismaAdmin.onlinePayment.findUnique({ where: { id: oid }, select: { studentId: true } });
    if (order) {
      dest = `${base}/fr/parent/children/${order.studentId}/scolarite?payment=${ok ? 'success' : 'failed'}`;
    }
  }
  return Response.redirect(dest, 303);
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
