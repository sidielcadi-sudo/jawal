/**
 * Modèles de messages de notification (FR / AR).
 * Le rendu choisit la langue selon la locale de l'établissement (ou du parent).
 * NB : pour WhatsApp Business API, ces libellés devront correspondre à des
 * templates pré-approuvés côté fournisseur — la clé `template` est conservée
 * dans le journal pour faire ce mapping plus tard.
 */
export type NotifyData = Record<string, string | number>;
type Tpl = (d: NotifyData) => string;

const TEMPLATES: Record<string, { fr: Tpl; ar: Tpl }> = {
  'transport.boarded': {
    fr: (d) => `${d.child} est bien monté(e) dans le bus scolaire.`,
    ar: (d) => `${d.child} صعد إلى الحافلة المدرسية.`,
  },
  'transport.notBoarded': {
    fr: (d) => `${d.child} n'a pas pris le bus ce matin.`,
    ar: (d) => `${d.child} لم يأخذ الحافلة هذا الصباح.`,
  },
  'transport.dropped': {
    fr: (d) => `${d.child} a été déposé(e) à l'arrêt${d.stop ? ` « ${d.stop} »` : ''}.`,
    ar: (d) => `${d.child} تم إنزاله في المحطة${d.stop ? ` «${d.stop}»` : ''}.`,
  },
  'transport.notPicked': {
    fr: (d) => `${d.child} n'a pas été récupéré(e)${d.stop ? ` à l'arrêt « ${d.stop} »` : ''}. Merci de venir le/la chercher.`,
    ar: (d) => `${d.child} لم يتم استلامه${d.stop ? ` في المحطة «${d.stop}»` : ''}. المرجو القدوم لأخذه.`,
  },
  'transport.incident': {
    fr: (d) => `Incident signalé concernant ${d.child} dans le transport. L'établissement vous contactera.`,
    ar: (d) => `تم الإبلاغ عن حادث يخص ${d.child} في النقل. ستتصل بكم المؤسسة.`,
  },
  'transport.approaching': {
    fr: (d) => `Le bus de la ligne « ${d.line} » arrive dans ${d.minutes} minutes.`,
    ar: (d) => `حافلة الخط «${d.line}» ستصل خلال ${d.minutes} دقائق.`,
  },
  'transport.delay': {
    fr: (d) => `Le bus de la ligne « ${d.line} » aura un retard d'environ ${d.minutes} minutes.`,
    ar: (d) => `حافلة الخط «${d.line}» ستتأخر بحوالي ${d.minutes} دقيقة.`,
  },
  'enrollment.refused': {
    fr: (d) => `La demande d'inscription de ${d.child} n'a pas été retenue.${d.reason ? ` Motif : ${d.reason}` : ''}`,
    ar: (d) => `لم يتم قبول طلب تسجيل ${d.child}.${d.reason ? ` السبب: ${d.reason}` : ''}`,
  },
  'leave.approved': {
    fr: (d) => `Votre demande de congé (${d.type}) du ${d.start} au ${d.end} a été approuvée.`,
    ar: (d) => `تمت الموافقة على طلب إجازتكم (${d.type}) من ${d.start} إلى ${d.end}.`,
  },
  'leave.rejected': {
    fr: (d) => `Votre demande de congé (${d.type}) du ${d.start} au ${d.end} a été refusée.${d.comment ? ` Motif : ${d.comment}` : ''}`,
    ar: (d) => `تم رفض طلب إجازتكم (${d.type}) من ${d.start} إلى ${d.end}.${d.comment ? ` السبب: ${d.comment}` : ''}`,
  },
};

export type NotificationTemplateKey = keyof typeof TEMPLATES;

export function renderTemplate(template: string, data: NotifyData, locale: string): string {
  const t = TEMPLATES[template];
  if (!t) return template;
  return (locale === 'ar' ? t.ar : t.fr)(data);
}
