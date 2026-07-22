/**
 * Rendu HTML du certificat de radiation — partagé entre la route admin et la
 * route portail parent (même document remis à la famille).
 */
const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const TYPE_FR: Record<string, string> = { TRANSFERT: 'transfert', DEPART: 'départ', AUTRE: 'radiation' };

export type RadiationCertificateInput = {
  tenantName: string;
  type: string;
  destinationSchool: string | null;
  approvedAt: Date | null;
  debtCleared: boolean;
  student: { firstName: string; lastName: string; birthDate: Date | null; cin: string | null };
  levelLabel: string;
  yearLabel: string;
};

export function renderRadiationCertificate(input: RadiationCertificateInput): string {
  const s = input.student;
  const today = new Date().toLocaleDateString('fr-FR');
  const dob = s.birthDate ? new Date(s.birthDate).toLocaleDateString('fr-FR') : '—';
  const dateRadiation = input.approvedAt ? new Date(input.approvedAt).toLocaleDateString('fr-FR') : today;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    *{font-family:'Segoe UI',Tahoma,Arial,sans-serif;}
    body{margin:0;color:#1e293b;font-size:13px;line-height:1.7;}
    .head{text-align:center;border-bottom:2px solid #1A56DB;padding-bottom:12px;}
    .estab{font-size:18px;font-weight:700;color:#143fa6;}
    h1{font-size:20px;margin:18px 0 6px;text-align:center;letter-spacing:0.5px;}
    .sub{text-align:center;color:#64748b;font-size:12px;margin-bottom:18px;}
    .body{margin:18px 6px;}
    .body b{color:#0f172a;}
    ul{margin:10px 0;}
    .sign{margin-top:48px;display:flex;justify-content:space-between;}
    .foot{margin-top:32px;font-size:10px;color:#94a3b8;text-align:center;}
  </style></head><body>
    <div class="head"><div class="estab">${esc(input.tenantName || 'Établissement')}</div></div>
    <h1>CERTIFICAT DE RADIATION</h1>
    <div class="sub">(certificat de ${TYPE_FR[input.type] ?? 'départ'})</div>
    <div class="body">
      <p>Je soussigné(e), responsable de l'établissement <b>${esc(input.tenantName)}</b>, certifie que :</p>
      <p style="font-size:15px;"><b>${esc(s.lastName)} ${esc(s.firstName)}</b>${s.cin ? `, CIN ${esc(s.cin)}` : ''}, né(e) le ${esc(dob)},
      inscrit(e) en <b>${esc(input.levelLabel)}</b> au titre de l'année scolaire <b>${esc(input.yearLabel)}</b>,</p>
      <p>a été <b>radié(e)</b> des effectifs de l'établissement à la date du <b>${esc(dateRadiation)}</b>${input.destinationSchool ? `, en vue d'un transfert vers <b>${esc(input.destinationSchool)}</b>` : ''}.</p>
      <p>En conséquence :</p>
      <ul>
        <li>l'élève a quitté l'établissement ;</li>
        <li>son dossier administratif est libéré ;</li>
        <li>${input.debtCleared ? 'il/elle est à jour de ses paiements (aucune dette en cours) ;' : 'la situation financière reste à régulariser auprès de la comptabilité ;'}</li>
        <li>il/elle peut être inscrit(e) dans un autre établissement.</li>
      </ul>
      <p>Le présent certificat est délivré pour servir et valoir ce que de droit.</p>
    </div>
    <div class="sign"><span>Fait le ${esc(today)}</span><span>Signature et cachet</span></div>
    <div class="foot">${esc(input.tenantName || 'LeadSchool')} — Document généré le ${esc(today)}</div>
  </body></html>`;
}
