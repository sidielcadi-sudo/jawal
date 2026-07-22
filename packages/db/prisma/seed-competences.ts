/**
 * Référentiel de compétences & aptitudes (APC — ministère marocain), version 2.
 *
 * Structure demandée : chaque DOMAINE contient des **Compétences** (type C) et
 * des **Aptitudes** (type A). Modèle interne :
 *   - Domaine (nœud racine, neutre)
 *   - Compétence / Aptitude (nœud intermédiaire, `kind` = DISCIPLINARY pour une
 *     compétence, TRANSVERSAL pour une aptitude — alias historiques conservés)
 *   - Sous-compétence / facette (feuille évaluable)
 * Une aptitude est ainsi un groupe « de type Aptitude » dont les facettes
 * listées deviennent les feuilles.
 *
 * Bilingue FR/AR. La traduction arabe fournie s'arrête en cours de
 * « Développement personnel » : les libellés AR manquants sont laissés vides
 * (le module reste pleinement utilisable en français).
 *
 * Idempotent : purge le référentiel de l'année active avant de recréer.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Leaf = { fr: string; ar?: string };
type Group = { type: 'C' | 'A'; fr: string; ar?: string; subject?: string; leaves: Leaf[] };
type Domain = { fr: string; ar?: string; groups: Group[] };

const REFERENTIAL: Domain[] = [
  {
    fr: 'Langues et communication',
    ar: 'اللغات والتواصل',
    groups: [
      {
        type: 'C', fr: "Maîtrise de l'arabe", ar: 'إتقان اللغة العربية', subject: 'ar',
        leaves: [
          { fr: 'Lecture', ar: 'القراءة' },
          { fr: 'Écriture', ar: 'الكتابة' },
          { fr: 'Expression orale', ar: 'التعبير الشفوي' },
        ],
      },
      {
        type: 'C', fr: 'Maîtrise du français', ar: 'إتقان اللغة الفرنسية', subject: 'fr',
        leaves: [
          { fr: 'Compréhension écrite', ar: 'الفهم الكتابي' },
          { fr: 'Production écrite', ar: 'الإنتاج الكتابي' },
          { fr: 'Expression orale', ar: 'التعبير الشفوي' },
        ],
      },
      {
        // Aucune matière « Amazigh » dans le tenant : ouvert à tous les enseignants.
        type: 'C', fr: "Maîtrise de l'amazigh", ar: 'إتقان الأمازيغية',
        leaves: [
          { fr: 'Lecture', ar: 'القراءة' },
          { fr: 'Écriture', ar: 'الكتابة' },
          { fr: 'Expression orale', ar: 'التعبير الشفوي' },
        ],
      },
      {
        type: 'C', fr: "Maîtrise de l'anglais", ar: 'إتقان الإنجليزية', subject: 'angl',
        leaves: [
          { fr: 'Compréhension écrite', ar: 'الفهم الكتابي' },
          { fr: 'Production écrite', ar: 'الإنتاج الكتابي' },
          { fr: 'Expression orale', ar: 'التعبير الشفوي' },
        ],
      },
      {
        type: 'A', fr: 'Communication', ar: 'التواصل',
        leaves: [
          { fr: 'Lecture', ar: 'القراءة' },
          { fr: 'Écriture', ar: 'الكتابة' },
          { fr: 'Expression orale', ar: 'التعبير الشفوي' },
        ],
      },
    ],
  },
  {
    fr: 'Méthodes et outils pour apprendre',
    ar: 'طرق وأدوات التعلم',
    groups: [
      {
        type: 'C', fr: 'Autonomie', ar: 'الاستقلالية',
        leaves: [
          { fr: 'Organisation du travail', ar: 'تنظيم العمل' },
          { fr: 'Gestion du temps', ar: 'تدبير الوقت' },
        ],
      },
      {
        type: 'A', fr: 'Autonomie et initiative', ar: 'الاستقلالية والمبادرة',
        leaves: [
          { fr: 'Organisation du travail', ar: 'تنظيم العمل' },
          { fr: 'Gestion du temps', ar: 'تدبير الوقت' },
        ],
      },
      {
        type: 'C', fr: 'Recherche documentaire', ar: 'البحث الوثائقي',
        leaves: [
          { fr: 'Utilisation de sources fiables', ar: 'استخدام مصادر موثوقة' },
          { fr: 'Analyse critique', ar: 'التحليل النقدي' },
        ],
      },
      {
        type: 'A', fr: 'Esprit critique et créativité', ar: 'الفكر النقدي والإبداع',
        leaves: [
          { fr: 'Argumentation', ar: 'الحجاج' },
          { fr: 'Analyse des informations', ar: 'تحليل المعلومات' },
        ],
      },
      {
        type: 'C', fr: 'Travail collaboratif', ar: 'العمل التعاوني',
        leaves: [
          { fr: 'Coopération', ar: 'التعاون' },
          { fr: 'Communication en groupe', ar: 'التواصل الجماعي' },
        ],
      },
      {
        type: 'A', fr: 'Collaboration', ar: 'التعاون',
        leaves: [
          { fr: 'Coopérer', ar: 'التعاون' },
          { fr: 'Travailler en équipe', ar: 'العمل الجماعي' },
        ],
      },
    ],
  },
  {
    fr: 'Formation citoyenne et valeurs',
    ar: 'التربية على المواطنة والقيم',
    groups: [
      {
        type: 'C', fr: 'Éducation civique et morale', ar: 'التربية المدنية والأخلاقية',
        leaves: [
          { fr: 'Respect des règles', ar: 'احترام القواعد' },
          { fr: 'Responsabilité', ar: 'المسؤولية' },
        ],
      },
      {
        type: 'C', fr: 'Citoyenneté', ar: 'المواطنة',
        leaves: [
          { fr: 'Engagement', ar: 'الانخراط' },
          { fr: 'Participation sociale', ar: 'المشاركة الاجتماعية' },
        ],
      },
      {
        type: 'C', fr: 'Valeurs nationales', ar: 'القيم الوطنية',
        leaves: [
          { fr: 'Respect de la diversité', ar: 'احترام التنوع' },
          { fr: 'Ouverture culturelle', ar: 'الانفتاح الثقافي' },
        ],
      },
      {
        type: 'A', fr: 'Citoyenneté et valeurs', ar: 'المواطنة والقيم',
        leaves: [
          { fr: 'Respect de la diversité', ar: 'احترام التنوع' },
          { fr: 'Engagement', ar: 'الانخراط' },
        ],
      },
    ],
  },
  {
    fr: 'Sciences et techniques',
    ar: 'العلوم والتقنيات',
    groups: [
      {
        type: 'C', fr: 'Observation et expérimentation', ar: 'الملاحظة والتجريب', subject: 'svt',
        leaves: [
          { fr: "Réalisation d'expériences", ar: 'إنجاز التجارب' },
          { fr: 'Analyse des résultats', ar: 'تحليل النتائج' },
        ],
      },
      {
        type: 'C', fr: 'Résolution de problèmes', ar: 'حل المشكلات', subject: 'math',
        leaves: [
          { fr: 'Mathématiques appliquées', ar: 'الرياضيات التطبيقية' },
          { fr: 'Raisonnement logique', ar: 'التفكير المنطقي' },
        ],
      },
      {
        type: 'C', fr: 'Innovation et créativité', ar: 'الابتكار والإبداع',
        leaves: [
          { fr: 'Conception de projets', ar: 'تصميم المشاريع' },
          { fr: "Esprit d'initiative", ar: 'روح المبادرة' },
        ],
      },
      {
        type: 'A', fr: 'Esprit critique et créativité', ar: 'الفكر النقدي والإبداع',
        leaves: [
          { fr: 'Conception de projets', ar: 'تصميم المشاريع' },
          { fr: "Esprit d'initiative", ar: 'روح المبادرة' },
        ],
      },
    ],
  },
  {
    fr: 'Culture et société',
    ar: 'الثقافة والمجتمع',
    groups: [
      {
        type: 'C', fr: 'Histoire', ar: 'التاريخ', subject: 'hg',
        leaves: [
          { fr: 'Compréhension des événements', ar: 'فهم الأحداث' },
          { fr: 'Analyse des causes', ar: 'تحليل الأسباب' },
        ],
      },
      {
        type: 'C', fr: 'Géographie', ar: 'الجغرافيا', subject: 'hg',
        leaves: [
          { fr: 'Lecture de cartes', ar: 'قراءة الخرائط' },
          { fr: 'Analyse des territoires', ar: 'تحليل المجالات' },
        ],
      },
      {
        type: 'C', fr: 'Arts et patrimoine', ar: 'الفنون والتراث',
        leaves: [
          { fr: 'Expression artistique', ar: 'التعبير الفني' },
          { fr: 'Connaissance du patrimoine', ar: 'معرفة التراث' },
        ],
      },
      {
        type: 'C', fr: 'Ouverture sur le monde', ar: 'الانفتاح على العالم',
        leaves: [
          { fr: 'Interculturalité', ar: 'التعددية الثقافية' },
          { fr: 'Actualité internationale', ar: 'الأحداث الدولية' },
        ],
      },
    ],
  },
  {
    fr: 'Développement personnel',
    ar: 'التنمية الشخصية',
    groups: [
      {
        type: 'C', fr: 'Développement cognitif', ar: 'التنمية المعرفية',
        leaves: [
          { fr: 'Mémoire', ar: 'الذاكرة' },
          { fr: 'Raisonnement', ar: 'التفكير' },
        ],
      },
      {
        type: 'C', fr: 'Développement social', ar: 'التنمية الاجتماعية',
        leaves: [
          { fr: 'Travail en équipe', ar: 'العمل الجماعي' },
          { fr: 'Communication', ar: 'التواصل' },
        ],
      },
      {
        // Traduction AR interrompue à partir d'ici (message tronqué).
        type: 'C', fr: 'Développement affectif', ar: 'التنمية الوجدانية',
        leaves: [
          { fr: 'Gestion des émotions', ar: 'تدبير العواطف' },
          { fr: 'Confiance en soi' },
        ],
      },
      {
        type: 'C', fr: 'Compétences de vie',
        leaves: [{ fr: 'Prise de parole' }, { fr: 'Résolution de conflits' }],
      },
      {
        type: 'A', fr: 'Développement personnel',
        leaves: [{ fr: 'Confiance en soi' }, { fr: 'Gestion des émotions' }],
      },
    ],
  },
  {
    fr: 'Compétences numériques',
    groups: [
      {
        type: 'C', fr: 'Utilisation des outils digitaux', subject: 'info',
        leaves: [{ fr: 'Traitement de texte' }, { fr: 'Tableur' }, { fr: 'Présentation' }],
      },
      {
        type: 'C', fr: 'Culture numérique',
        leaves: [{ fr: 'Compréhension des usages' }, { fr: 'Éthique numérique' }],
      },
      {
        type: 'C', fr: 'Sécurité et citoyenneté numérique',
        leaves: [{ fr: 'Protection des données' }, { fr: 'Comportement responsable' }],
      },
      {
        type: 'A', fr: 'Compétences numériques',
        leaves: [{ fr: 'Utilisation des logiciels' }, { fr: 'Protection des données' }],
      },
    ],
  },
];

const SCALE = [
  { code: 'NA', labelFr: 'Non acquis', labelAr: 'غير مكتسب', value: 0, color: '#ef4444', order: 0 },
  { code: 'ECA', labelFr: "En cours d'acquisition", labelAr: 'في طور الاكتساب', value: 1, color: '#eab308', order: 1 },
  { code: 'A', labelFr: 'Acquis', labelAr: 'مكتسب', value: 2, color: '#4ade80', order: 2 },
  { code: 'M', labelFr: 'Maîtrisé', labelAr: 'متمكّن', value: 3, color: '#16a34a', order: 3 },
];

async function seedTenant(tenantId: string) {
  const year = await prisma.academicYear.findFirst({ where: { tenantId, active: true } });
  if (!year) {
    console.log('  ⚠ aucune année active — ignoré');
    return;
  }

  for (const s of SCALE) {
    await prisma.masteryLevel.upsert({
      where: { tenantId_code: { tenantId, code: s.code } },
      create: { tenantId, ...s },
      update: { labelFr: s.labelFr, labelAr: s.labelAr, value: s.value, color: s.color, order: s.order },
    });
  }

  const framework = await prisma.competencyFramework.upsert({
    where: { tenantId_academicYearId_version: { tenantId, academicYearId: year.id, version: 1 } },
    create: { tenantId, academicYearId: year.id, label: `Référentiel de compétences ${year.label}`, version: 1, status: 'ACTIVE' },
    update: { status: 'ACTIVE' },
  });

  // Purge du référentiel existant (les évaluations/bilans liés tombent en cascade).
  await prisma.competencyNode.deleteMany({ where: { frameworkId: framework.id } });

  const subjects = await prisma.subject.findMany({ where: { tenantId }, select: { id: true, code: true } });
  const subjectId = (code?: string) => (code ? subjects.find((s) => s.code === code)?.id ?? null : null);

  let domainOrder = 0;
  let leafCount = 0;
  for (const d of REFERENTIAL) {
    const domain = await prisma.competencyNode.create({
      data: { tenantId, frameworkId: framework.id, kind: 'DISCIPLINARY', labelFr: d.fr, labelAr: d.ar ?? null, depth: 0, order: domainOrder++ },
    });
    let gOrder = 0;
    for (const g of d.groups) {
      const kind = g.type === 'C' ? 'DISCIPLINARY' : 'TRANSVERSAL';
      const group = await prisma.competencyNode.create({
        data: {
          tenantId, frameworkId: framework.id, parentId: domain.id, kind,
          labelFr: g.fr, labelAr: g.ar ?? null, subjectId: subjectId(g.subject), depth: 1, order: gOrder++,
        },
      });
      let lOrder = 0;
      for (const l of g.leaves) {
        await prisma.competencyNode.create({
          data: {
            tenantId, frameworkId: framework.id, parentId: group.id, kind,
            labelFr: l.fr, labelAr: l.ar ?? null, subjectId: subjectId(g.subject),
            depth: 2, order: lOrder++, isLeaf: true,
          },
        });
        leafCount++;
      }
    }
  }
  console.log(`  ✔ ${REFERENTIAL.length} domaines, ${leafCount} items évaluables`);
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const t of tenants) {
    console.log(`→ ${t.name}`);
    await seedTenant(t.id);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
