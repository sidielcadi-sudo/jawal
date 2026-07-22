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
  // ── Remplacements (étape 4 « Communication ») ────────────────────────────
  'substitution.assigned': {
    fr: (d) => `Vous assurez un remplacement le ${d.date} (${d.slot}) — ${d.subject} avec la classe ${d.class}${d.room ? `, salle ${d.room}` : ''}.`,
    ar: (d) => `ستؤمّنون تعويضًا يوم ${d.date} (${d.slot}) — ${d.subject} مع قسم ${d.class}${d.room ? `، القاعة ${d.room}` : ''}.`,
  },
  'substitution.class': {
    fr: (d) => `Le cours de ${d.subject} du ${d.date} (${d.slot}) de ${d.child} sera assuré par un(e) remplaçant(e).`,
    ar: (d) => `حصة ${d.subject} يوم ${d.date} (${d.slot}) الخاصة بـ ${d.child} سيؤمّنها أستاذ(ة) معوّض(ة).`,
  },
  'substitution.cancelled': {
    fr: (d) => `Le cours de ${d.subject} du ${d.date} (${d.slot}) de ${d.child} est annulé.`,
    ar: (d) => `حصة ${d.subject} يوم ${d.date} (${d.slot}) الخاصة بـ ${d.child} ملغاة.`,
  },
  // ── Annulation d'absence : le prof est finalement présent ────────────────
  'substitution.reverted': {
    fr: (d) => `Le remplacement du ${d.date} (${d.slot}) — ${d.subject} avec la classe ${d.class} est annulé : ${d.teacher} assure son cours.`,
    ar: (d) => `تم إلغاء التعويض ليوم ${d.date} (${d.slot}) — ${d.subject} مع قسم ${d.class}: ${d.teacher} سيؤمّن حصته.`,
  },
  'substitution.maintained': {
    fr: (d) => `Le cours de ${d.subject} du ${d.date} (${d.slot}) de ${d.child} est maintenu : le professeur est présent.`,
    ar: (d) => `حصة ${d.subject} يوم ${d.date} (${d.slot}) الخاصة بـ ${d.child} مؤكَّدة: الأستاذ حاضر.`,
  },
  // ── Changement de classe ─────────────────────────────────────────────────
  'class.changed': {
    fr: (d) =>
      `${d.child} a changé de classe : ${d.oldClass} → ${d.newClass}. L'attestation de scolarité, l'emploi du temps et l'équipe pédagogique ont été mis à jour.`,
    ar: (d) =>
      `${d.child} غيّر القسم: ${d.oldClass} ← ${d.newClass}. تم تحديث شهادة التمدرس واستعمال الزمن والطاقم التربوي.`,
  },
  'class.teacher': {
    fr: (d) => `${d.child} a rejoint votre classe ${d.newClass}.`,
    ar: (d) => `${d.child} التحق بقسمكم ${d.newClass}.`,
  },
  'class.teacherLeft': {
    fr: (d) => `${d.child} a quitté votre classe ${d.oldClass} (nouvelle classe : ${d.newClass}).`,
    ar: (d) => `${d.child} غادر قسمكم ${d.oldClass} (القسم الجديد: ${d.newClass}).`,
  },
  // ── Soutien scolaire ─────────────────────────────────────────────────────
  'support.enrolled': {
    fr: (d) =>
      `${d.child} est inscrit(e) au cours de soutien « ${d.course} »${d.subject ? ` (${d.subject})` : ''}${d.slot ? ` — ${d.slot}` : ''}.`,
    ar: (d) =>
      `${d.child} مسجّل في درس الدعم «${d.course}»${d.subject ? ` (${d.subject})` : ''}${d.slot ? ` — ${d.slot}` : ''}.`,
  },
  'support.absent': {
    fr: (d) =>
      `${d.child} a été noté(e) absent(e) au cours de soutien « ${d.course} » du ${d.date}${d.topic ? ` (${d.topic})` : ''}.`,
    ar: (d) =>
      `${d.child} سُجّل غائبًا في درس الدعم «${d.course}» يوم ${d.date}${d.topic ? ` (${d.topic})` : ''}.`,
  },
  // Bilan de compétences : notifié **au gel périodique** uniquement, jamais à
  // chaque évaluation (une classe de 30 × 20 items = 600 notifications).
  'competency.report': {
    fr: (d) =>
      `Le bilan de compétences de ${d.child} pour ${d.period} est disponible : ${d.disciplinary} en compétences disciplinaires, ${d.transversal} en aptitudes transversales. Consultez le détail dans votre espace parent.`,
    ar: (d) =>
      `حصيلة كفايات ${d.child} برسم ${d.period} متاحة: ${d.disciplinary} في الكفايات المادّية، و${d.transversal} في القدرات العرضانية. يمكنكم الاطلاع على التفاصيل في فضاء الآباء.`,
  },
};

export type NotificationTemplateKey = keyof typeof TEMPLATES;

export function renderTemplate(template: string, data: NotifyData, locale: string): string {
  const t = TEMPLATES[template];
  if (!t) return template;
  return (locale === 'ar' ? t.ar : t.fr)(data);
}
