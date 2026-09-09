/**
 * Référentiel des filières du lycée marocain (MENPS) : options du Tronc
 * commun, spécialités de 1ʳᵉ et 2ᵉ année Bac, et coefficients par matière.
 *
 * Données de **référence**, pas de vérité absolue : un établissement peut les
 * ajuster après import. Les filières dont les coefficients officiels ne sont
 * pas renseignés ici sont créées sans coefficient — elles héritent alors du
 * niveau puis de la matière (cf. `resolveCoefficients`).
 *
 * Les matières sont désignées par **code** ; l'import les résout contre les
 * `Subject` existants et crée celles qui manquent.
 */

export type PresetSubject = { code: string; label: string; labelAr: string };

/** Matières nécessaires au lycée, au-delà du socle collège déjà présent. */
export const PRESET_SUBJECTS: PresetSubject[] = [
  { code: 'math', label: 'Mathématiques', labelAr: 'الرياضيات' },
  { code: 'pc', label: 'Physique-Chimie', labelAr: 'الفيزياء والكيمياء' },
  { code: 'svt', label: 'Sciences de la Vie et de la Terre', labelAr: 'علوم الحياة والأرض' },
  { code: 'fr', label: 'Français', labelAr: 'الفرنسية' },
  { code: 'ar', label: 'Arabe', labelAr: 'اللغة العربية' },
  { code: 'angl', label: 'Anglais', labelAr: 'الإنجليزية' },
  { code: 'hg', label: 'Histoire-Géographie', labelAr: 'الاجتماعيات' },
  { code: 'islam', label: 'Éducation islamique', labelAr: 'التربية الإسلامية' },
  { code: 'info', label: 'Informatique', labelAr: 'المعلوميات' },
  { code: 'philo', label: 'Philosophie', labelAr: 'الفلسفة' },
  { code: 'eco', label: 'Économie', labelAr: 'الاقتصاد' },
  { code: 'compta', label: 'Comptabilité', labelAr: 'المحاسبة' },
  { code: 'gestion', label: 'Gestion', labelAr: 'التدبير' },
  { code: 'agro', label: 'Agronomie', labelAr: 'علوم فلاحية' },
  { code: 'arts', label: 'Arts appliqués', labelAr: 'الفنون التطبيقية' },
  { code: 'arts-pl', label: 'Arts plastiques', labelAr: 'الفنون التشكيلية' },
  { code: 'eps', label: 'Éducation physique et sportive', labelAr: 'التربية البدنية' },
  { code: 'si', label: "Sciences de l'ingénieur", labelAr: 'علوم المهندس' },
  { code: 'droit', label: 'Droit', labelAr: 'القانون' },
  { code: 'eoae', label: "Économie et organisation administrative", labelAr: 'الاقتصاد والتنظيم الإداري' },
  { code: 'conduite', label: 'Assiduité et conduite', labelAr: 'المواظبة والسلوك' },
];

/** Niveaux du cycle lycée, avec la pondération réglementaire associée. */
export type PresetLevel = {
  code: string;
  label: string;
  labelAr: string;
  order: number;
  /** Barème CC / semestriel / régional / national. */
  weights: { cc: number; semester: number; regional: number; national: number };
};

export const PRESET_CYCLE = {
  code: 'lycee',
  label: 'Lycée',
  labelAr: 'التعليم الثانوي التأهيلي',
  order: 30,
};

export const PRESET_LEVELS: PresetLevel[] = [
  {
    code: 'tc',
    label: 'Tronc commun',
    labelAr: 'الجذع المشترك',
    order: 1,
    weights: { cc: 40, semester: 60, regional: 0, national: 0 },
  },
  {
    code: '1bac',
    label: '1ère année Bac',
    labelAr: 'الأولى باكالوريا',
    order: 2,
    weights: { cc: 30, semester: 40, regional: 30, national: 0 },
  },
  {
    code: '2bac',
    label: '2ème année Bac',
    labelAr: 'الثانية باكالوريا',
    order: 3,
    weights: { cc: 20, semester: 30, regional: 0, national: 50 },
  },
];

export type PresetTrack = {
  /** Code du niveau (`tc`, `1bac`, `2bac`). */
  levelCode: string;
  code: string;
  label: string;
  labelAr: string;
  order: number;
  /** Coefficients par code matière. Vide = coefficients non officialisés ici. */
  coefficients: Record<string, number>;
};

export const PRESET_TRACKS: PresetTrack[] = [
  // ── Tronc commun : options ────────────────────────────────────────────
  {
    levelCode: 'tc',
    code: 'tc-sciences',
    label: 'TC Sciences',
    labelAr: 'جذع مشترك علمي',
    order: 10,
    coefficients: { math: 5, pc: 4, svt: 3, fr: 2, ar: 2, hg: 2, angl: 2, info: 1, islam: 1, philo: 1 },
  },
  {
    levelCode: 'tc',
    code: 'tc-lettres',
    label: 'TC Lettres & Sciences Humaines',
    labelAr: 'جذع مشترك آداب وعلوم إنسانية',
    order: 20,
    coefficients: { ar: 5, fr: 4, philo: 3, hg: 3, math: 2, angl: 2, islam: 1 },
  },
  {
    levelCode: 'tc',
    code: 'tc-eco',
    label: 'TC Économie & Gestion',
    labelAr: 'جذع مشترك اقتصاد وتدبير',
    order: 30,
    coefficients: { math: 4, eco: 4, compta: 3, fr: 3, ar: 2, angl: 2, hg: 2 },
  },
  {
    levelCode: 'tc',
    code: 'tc-techno',
    label: 'TC Technologique',
    labelAr: 'جذع مشترك تكنولوجي',
    order: 35,
    coefficients: {},
  },
  {
    levelCode: 'tc',
    code: 'tc-arts',
    label: 'TC Arts Appliqués',
    labelAr: 'جذع مشترك فنون تطبيقية',
    order: 40,
    coefficients: {},
  },
  {
    levelCode: 'tc',
    code: 'tc-agro',
    label: 'TC Sciences Agronomiques',
    labelAr: 'جذع مشترك علوم فلاحية',
    order: 50,
    coefficients: {},
  },

  // ── 1ʳᵉ année Bac : spécialités ───────────────────────────────────────
  {
    levelCode: '1bac',
    code: '1bac-sma',
    label: '1BAC Sciences Mathématiques A',
    labelAr: 'الأولى باك علوم رياضية أ',
    order: 10,
    coefficients: { math: 7, pc: 5, svt: 3, fr: 2, ar: 2, philo: 2, angl: 2, islam: 1 },
  },
  {
    levelCode: '1bac',
    code: '1bac-smb',
    label: '1BAC Sciences Mathématiques B',
    labelAr: 'الأولى باك علوم رياضية ب',
    order: 20,
    coefficients: { math: 7, pc: 5, svt: 3, fr: 2, ar: 2, philo: 2, angl: 2, islam: 1 },
  },
  {
    levelCode: '1bac',
    code: '1bac-sp',
    label: '1BAC Sciences Physiques',
    labelAr: 'الأولى باك علوم فيزيائية',
    order: 30,
    coefficients: { pc: 6, math: 5, svt: 3, fr: 2, ar: 2, philo: 2, angl: 2 },
  },
  {
    levelCode: '1bac',
    code: '1bac-svt',
    label: '1BAC Sciences de la Vie et de la Terre',
    labelAr: 'الأولى باك علوم الحياة والأرض',
    order: 40,
    coefficients: { svt: 6, math: 4, pc: 4, fr: 2, ar: 2, philo: 2, angl: 2 },
  },
  {
    levelCode: '1bac',
    code: '1bac-eco',
    label: '1BAC Sciences Économiques',
    labelAr: 'الأولى باك علوم اقتصادية',
    order: 50,
    coefficients: { eco: 6, math: 4, compta: 4, gestion: 3, fr: 3, ar: 2, angl: 2 },
  },
  {
    levelCode: '1bac',
    code: '1bac-tgc',
    label: '1BAC Techniques de Gestion & Comptabilité',
    labelAr: 'الأولى باك علوم التدبير المحاسباتي',
    order: 60,
    coefficients: {},
  },
  {
    levelCode: '1bac',
    code: '1bac-lettres',
    label: '1BAC Lettres',
    labelAr: 'الأولى باك آداب',
    order: 70,
    coefficients: { ar: 6, philo: 4, fr: 3, hg: 3, angl: 2, math: 2 },
  },
  {
    levelCode: '1bac',
    code: '1bac-sh',
    label: '1BAC Sciences Humaines',
    labelAr: 'الأولى باك علوم إنسانية',
    order: 80,
    coefficients: {},
  },
  {
    levelCode: '1bac',
    code: '1bac-arts',
    label: '1BAC Arts Appliqués',
    labelAr: 'الأولى باك فنون تطبيقية',
    order: 90,
    coefficients: {},
  },
  {
    levelCode: '1bac',
    code: '1bac-agro',
    label: '1BAC Sciences Agronomiques',
    labelAr: 'الأولى باك علوم فلاحية',
    order: 100,
    coefficients: {},
  },

  // ── 2ᵉ année Bac : spécialités (coefficients renforcés) ───────────────
  {
    levelCode: '2bac',
    code: '2bac-sma',
    label: '2BAC Sciences Mathématiques A',
    labelAr: 'الثانية باك علوم رياضية أ',
    order: 10,
    coefficients: { math: 9, pc: 7, svt: 4, fr: 3, philo: 2, ar: 2, angl: 2 },
  },
  {
    levelCode: '2bac',
    code: '2bac-smb',
    label: '2BAC Sciences Mathématiques B',
    labelAr: 'الثانية باك علوم رياضية ب',
    order: 20,
    coefficients: { math: 9, pc: 7, svt: 4, fr: 3, philo: 2, ar: 2, angl: 2 },
  },
  {
    levelCode: '2bac',
    code: '2bac-sp',
    label: '2BAC Sciences Physiques',
    labelAr: 'الثانية باك علوم فيزيائية',
    order: 30,
    coefficients: { pc: 9, math: 7, svt: 4, fr: 3, philo: 2, ar: 2, angl: 2 },
  },
  {
    levelCode: '2bac',
    code: '2bac-svt',
    label: '2BAC Sciences de la Vie et de la Terre',
    labelAr: 'الثانية باك علوم الحياة والأرض',
    order: 40,
    coefficients: { svt: 9, pc: 6, math: 5, fr: 3, philo: 2, ar: 2, angl: 2 },
  },
  {
    levelCode: '2bac',
    code: '2bac-eco',
    label: '2BAC Sciences Économiques',
    labelAr: 'الثانية باك علوم اقتصادية',
    order: 50,
    coefficients: { eco: 8, compta: 7, math: 5, gestion: 4, fr: 3, ar: 2, angl: 2 },
  },
  {
    levelCode: '2bac',
    code: '2bac-tgc',
    label: '2BAC Techniques de Gestion & Comptabilité',
    labelAr: 'الثانية باك علوم التدبير المحاسباتي',
    order: 60,
    coefficients: {},
  },
  {
    levelCode: '2bac',
    code: '2bac-lettres',
    label: '2BAC Lettres',
    labelAr: 'الثانية باك آداب',
    order: 70,
    coefficients: { ar: 8, philo: 6, fr: 4, hg: 4, angl: 2, math: 2 },
  },
  {
    levelCode: '2bac',
    code: '2bac-sh',
    label: '2BAC Sciences Humaines',
    labelAr: 'الثانية باك علوم إنسانية',
    order: 80,
    coefficients: {},
  },
  {
    levelCode: '2bac',
    code: '2bac-arts',
    label: '2BAC Arts Appliqués',
    labelAr: 'الثانية باك فنون تطبيقية',
    order: 90,
    coefficients: {},
  },
  {
    levelCode: '2bac',
    code: '2bac-agro',
    label: '2BAC Sciences Agronomiques',
    labelAr: 'الثانية باك علوم فلاحية',
    order: 100,
    coefficients: {},
  },
];

/**
 * Matières évaluées à l'épreuve certificative (Régional en 1BAC, National en
 * 2BAC). Au Maroc, le Régional ne porte que sur une partie des matières — les
 * autres sont reportées au National. Liste indicative, ajustable après import.
 */
export const CERTIFYING_SUBJECTS: Record<string, string[]> = {
  // 1BAC — Régional : matières qui s'arrêtent en fin de 1ʳᵉ année.
  '1bac-sma': ['fr', 'ar', 'islam', 'hg', 'svt'],
  '1bac-smb': ['fr', 'ar', 'islam', 'hg', 'svt'],
  '1bac-sp': ['fr', 'ar', 'islam', 'hg', 'svt'],
  '1bac-svt': ['fr', 'ar', 'islam', 'hg'],
  '1bac-eco': ['fr', 'ar', 'islam', 'hg'],
  '1bac-lettres': ['fr', 'islam', 'math'],
  // 2BAC — National : les matières de spécialité.
  '2bac-sma': ['math', 'pc', 'svt', 'fr', 'philo', 'ar', 'angl'],
  '2bac-smb': ['math', 'pc', 'svt', 'fr', 'philo', 'ar', 'angl'],
  '2bac-sp': ['pc', 'math', 'svt', 'fr', 'philo', 'ar', 'angl'],
  '2bac-svt': ['svt', 'pc', 'math', 'fr', 'philo', 'ar', 'angl'],
  '2bac-eco': ['eco', 'compta', 'math', 'gestion', 'fr', 'ar', 'angl'],
  '2bac-lettres': ['ar', 'philo', 'fr', 'hg', 'angl', 'math'],
};

/* ────────────────────────────────────────────────────────────────────────
   Maquette des épreuves du Baccalauréat national (2BAC)
   ──────────────────────────────────────────────────────────────────────── */

export type BlueprintType = 'SPECIALITY' | 'SECONDARY' | 'LITERARY';

export type PresetBlueprint = {
  /** Code de filière (`2bac-sma`…). */
  trackCode: string;
  /** Code matière. */
  subjectCode: string;
  durationMin: number;
  type: BlueprintType;
  /**
   * Groupe de **sujet identique**. Deux filières partageant ce code sur la
   * même matière composent sur le même sujet → une seule épreuve à planifier.
   * `null` = sujet propre à la filière, même si la durée coïncide avec celle
   * d'une autre filière.
   */
  paperGroup: string | null;
};

/**
 * Groupes de sujets identiques du Bac national, tels que dressés par
 * l'établissement. Ils servent d'étiquette lisible dans l'écran de
 * paramétrage — l'algorithme, lui, ne regarde que `paperGroup`.
 */
export const PAPER_GROUPS: Record<string, { label: string; labelAr: string }> = {
  'sci-spec-math': { label: 'Maths spécialité — SMA/SMB', labelAr: 'الرياضيات تخصص — ع ر أ/ب' },
  'sci-sec-pc': { label: 'Physique-Chimie secondaire — SMA/SMB', labelAr: 'الفيزياء ثانوية — ع ر أ/ب' },
  'sci-lit': { label: 'Tronc littéraire — SMA/SMB/SP', labelAr: 'الجذع الأدبي — ع ر أ/ب، ع ف' },
  'svt-agro-lit': { label: 'Tronc littéraire — SVT/Agronomie', labelAr: 'الجذع الأدبي — ع ح أ/فلاحية' },
  'eco-tgc-math': { label: 'Maths — Économie/TGC', labelAr: 'الرياضيات — اقتصاد/تدبير' },
  'eco-tgc-lit': { label: 'Tronc littéraire — Économie/TGC', labelAr: 'الجذع الأدبي — اقتصاد/تدبير' },
  'let-sh': { label: 'Toutes épreuves — Lettres/Sciences Humaines', labelAr: 'كل الاختبارات — آداب/علوم إنسانية' },
};

const H = (h: number) => h * 60;

/**
 * Durées et regroupements du Bac national par filière.
 *
 * Deux pièges encodés explicitement, parce qu'ils se ressemblent à l'œil nu :
 *  - **SVT en SMA/SMB/SP** : 3 h dans les trois filières, mais *pas le même
 *    sujet* → `paperGroup: null`, trois épreuves distinctes.
 *  - **Gestion en Économie/TGC** : 3 h des deux côtés, sujets différents.
 *
 * À l'inverse, tout le tronc littéraire (Arabe, Français, Philosophie,
 * Anglais) est mutualisé à l'intérieur de chaque groupe de filières.
 */
export const PRESET_BLUEPRINTS: PresetBlueprint[] = [
  // ── Scientifiques : SMA / SMB ────────────────────────────────────────
  ...['2bac-sma', '2bac-smb'].flatMap((trackCode): PresetBlueprint[] => [
    { trackCode, subjectCode: 'math', durationMin: H(4), type: 'SPECIALITY', paperGroup: 'sci-spec-math' },
    { trackCode, subjectCode: 'pc', durationMin: H(3), type: 'SECONDARY', paperGroup: 'sci-sec-pc' },
    // Même durée que SP, sujet différent → pas de mutualisation.
    { trackCode, subjectCode: 'svt', durationMin: H(3), type: 'SECONDARY', paperGroup: null },
    { trackCode, subjectCode: 'ar', durationMin: H(2), type: 'LITERARY', paperGroup: 'sci-lit' },
    { trackCode, subjectCode: 'fr', durationMin: H(2), type: 'LITERARY', paperGroup: 'sci-lit' },
    { trackCode, subjectCode: 'philo', durationMin: H(2), type: 'LITERARY', paperGroup: 'sci-lit' },
    { trackCode, subjectCode: 'angl', durationMin: H(2), type: 'LITERARY', paperGroup: 'sci-lit' },
  ]),

  // ── Sciences Physiques ───────────────────────────────────────────────
  { trackCode: '2bac-sp', subjectCode: 'pc', durationMin: H(4), type: 'SPECIALITY', paperGroup: null },
  { trackCode: '2bac-sp', subjectCode: 'math', durationMin: H(3), type: 'SECONDARY', paperGroup: null },
  { trackCode: '2bac-sp', subjectCode: 'svt', durationMin: H(3), type: 'SECONDARY', paperGroup: null },
  { trackCode: '2bac-sp', subjectCode: 'ar', durationMin: H(2), type: 'LITERARY', paperGroup: 'sci-lit' },
  { trackCode: '2bac-sp', subjectCode: 'fr', durationMin: H(2), type: 'LITERARY', paperGroup: 'sci-lit' },
  { trackCode: '2bac-sp', subjectCode: 'philo', durationMin: H(2), type: 'LITERARY', paperGroup: 'sci-lit' },
  { trackCode: '2bac-sp', subjectCode: 'angl', durationMin: H(2), type: 'LITERARY', paperGroup: 'sci-lit' },

  // ── Sciences de la Vie et de la Terre ────────────────────────────────
  { trackCode: '2bac-svt', subjectCode: 'svt', durationMin: H(4), type: 'SPECIALITY', paperGroup: null },
  { trackCode: '2bac-svt', subjectCode: 'pc', durationMin: H(3), type: 'SECONDARY', paperGroup: null },
  { trackCode: '2bac-svt', subjectCode: 'math', durationMin: H(3), type: 'SECONDARY', paperGroup: null },
  { trackCode: '2bac-svt', subjectCode: 'ar', durationMin: H(2), type: 'LITERARY', paperGroup: 'svt-agro-lit' },
  { trackCode: '2bac-svt', subjectCode: 'fr', durationMin: H(2), type: 'LITERARY', paperGroup: 'svt-agro-lit' },
  { trackCode: '2bac-svt', subjectCode: 'philo', durationMin: H(2), type: 'LITERARY', paperGroup: 'svt-agro-lit' },
  { trackCode: '2bac-svt', subjectCode: 'angl', durationMin: H(2), type: 'LITERARY', paperGroup: 'svt-agro-lit' },

  // ── Sciences Agronomiques ────────────────────────────────────────────
  { trackCode: '2bac-agro', subjectCode: 'agro', durationMin: H(4), type: 'SPECIALITY', paperGroup: null },
  { trackCode: '2bac-agro', subjectCode: 'svt', durationMin: H(3), type: 'SECONDARY', paperGroup: null },
  { trackCode: '2bac-agro', subjectCode: 'math', durationMin: H(3), type: 'SECONDARY', paperGroup: null },
  { trackCode: '2bac-agro', subjectCode: 'ar', durationMin: H(2), type: 'LITERARY', paperGroup: 'svt-agro-lit' },
  { trackCode: '2bac-agro', subjectCode: 'fr', durationMin: H(2), type: 'LITERARY', paperGroup: 'svt-agro-lit' },
  { trackCode: '2bac-agro', subjectCode: 'philo', durationMin: H(2), type: 'LITERARY', paperGroup: 'svt-agro-lit' },
  { trackCode: '2bac-agro', subjectCode: 'angl', durationMin: H(2), type: 'LITERARY', paperGroup: 'svt-agro-lit' },

  // ── Économie ─────────────────────────────────────────────────────────
  { trackCode: '2bac-eco', subjectCode: 'eco', durationMin: H(4), type: 'SPECIALITY', paperGroup: null },
  // Même durée qu'en TGC, sujet différent.
  { trackCode: '2bac-eco', subjectCode: 'gestion', durationMin: H(3), type: 'SECONDARY', paperGroup: null },
  { trackCode: '2bac-eco', subjectCode: 'math', durationMin: H(3), type: 'SECONDARY', paperGroup: 'eco-tgc-math' },
  { trackCode: '2bac-eco', subjectCode: 'ar', durationMin: H(2), type: 'LITERARY', paperGroup: 'eco-tgc-lit' },
  { trackCode: '2bac-eco', subjectCode: 'fr', durationMin: H(2), type: 'LITERARY', paperGroup: 'eco-tgc-lit' },
  { trackCode: '2bac-eco', subjectCode: 'philo', durationMin: H(2), type: 'LITERARY', paperGroup: 'eco-tgc-lit' },
  { trackCode: '2bac-eco', subjectCode: 'angl', durationMin: H(2), type: 'LITERARY', paperGroup: 'eco-tgc-lit' },

  // ── Techniques de Gestion & Comptabilité ─────────────────────────────
  { trackCode: '2bac-tgc', subjectCode: 'compta', durationMin: H(3), type: 'SECONDARY', paperGroup: null },
  { trackCode: '2bac-tgc', subjectCode: 'gestion', durationMin: H(3), type: 'SECONDARY', paperGroup: null },
  { trackCode: '2bac-tgc', subjectCode: 'math', durationMin: H(3), type: 'SECONDARY', paperGroup: 'eco-tgc-math' },
  { trackCode: '2bac-tgc', subjectCode: 'ar', durationMin: H(2), type: 'LITERARY', paperGroup: 'eco-tgc-lit' },
  { trackCode: '2bac-tgc', subjectCode: 'fr', durationMin: H(2), type: 'LITERARY', paperGroup: 'eco-tgc-lit' },
  { trackCode: '2bac-tgc', subjectCode: 'philo', durationMin: H(2), type: 'LITERARY', paperGroup: 'eco-tgc-lit' },
  { trackCode: '2bac-tgc', subjectCode: 'angl', durationMin: H(2), type: 'LITERARY', paperGroup: 'eco-tgc-lit' },

  // ── Littéraires : Lettres / Sciences Humaines ────────────────────────
  ...['2bac-lettres', '2bac-sh'].flatMap((trackCode): PresetBlueprint[] => [
    { trackCode, subjectCode: 'ar', durationMin: H(4), type: 'SPECIALITY', paperGroup: 'let-sh' },
    { trackCode, subjectCode: 'philo', durationMin: H(3), type: 'SECONDARY', paperGroup: 'let-sh' },
    { trackCode, subjectCode: 'fr', durationMin: H(3), type: 'SECONDARY', paperGroup: 'let-sh' },
    { trackCode, subjectCode: 'hg', durationMin: H(3), type: 'SECONDARY', paperGroup: 'let-sh' },
    { trackCode, subjectCode: 'angl', durationMin: H(2), type: 'LITERARY', paperGroup: 'let-sh' },
    { trackCode, subjectCode: 'math', durationMin: H(2), type: 'LITERARY', paperGroup: 'let-sh' },
  ]),

  // ── Arts Appliqués ───────────────────────────────────────────────────
  { trackCode: '2bac-arts', subjectCode: 'arts', durationMin: H(4), type: 'SPECIALITY', paperGroup: null },
  { trackCode: '2bac-arts', subjectCode: 'philo', durationMin: H(3), type: 'SECONDARY', paperGroup: null },
  { trackCode: '2bac-arts', subjectCode: 'fr', durationMin: H(3), type: 'SECONDARY', paperGroup: null },
  { trackCode: '2bac-arts', subjectCode: 'ar', durationMin: H(2), type: 'LITERARY', paperGroup: null },
  { trackCode: '2bac-arts', subjectCode: 'angl', durationMin: H(2), type: 'LITERARY', paperGroup: null },
  { trackCode: '2bac-arts', subjectCode: 'math', durationMin: H(2), type: 'LITERARY', paperGroup: null },
];

/* ────────────────────────────────────────────────────────────────────────
   Programme par filière : volume horaire et coefficient de contrôle continu
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Attention à ne pas confondre deux coefficients qui coexistent au lycée :
 *
 *  - le **coefficient d'examen** (`PRESET_TRACKS.coefficients`) : celui du Bac
 *    national ou régional — 9 en maths pour 2BAC SMA ;
 *  - le **coefficient de contrôle continu** ci-dessous : celui de la moyenne
 *    semestrielle, qui suit le volume horaire — 7 en maths pour 2BAC SMA.
 *
 * Les écraser l'un par l'autre fausserait soit les bulletins, soit le Bac.
 */
export type PresetCurriculumRow = {
  subjectCode: string;
  /** Heures hebdomadaires. 0 = pas d'horaire (ex. Assiduité et Conduite). */
  hours: number;
  /** Coefficient de la moyenne semestrielle. */
  cc: number;
};

export type PresetTrackCurriculum = {
  trackCode: string;
  rows: PresetCurriculumRow[];
};

/** Tronc littéraire commun à la quasi-totalité des filières du lycée. */
const COMMON = (over: Partial<Record<string, [number, number]>> = {}): PresetCurriculumRow[] => {
  const base: Record<string, [number, number]> = {
    ar: [2, 2],
    fr: [4, 4],
    angl: [3, 3],
    hg: [2, 2],
    philo: [2, 2],
    islam: [2, 2],
    eps: [2, 2],
    conduite: [0, 1],
    ...over,
  };
  return Object.entries(base).map(([subjectCode, [hours, cc]]) => ({ subjectCode, hours, cc }));
};

export const PRESET_TRACK_CURRICULUM: PresetTrackCurriculum[] = [
  // ── Tronc commun ─────────────────────────────────────────────────────
  {
    trackCode: 'tc-sciences',
    rows: [
      { subjectCode: 'math', hours: 5, cc: 5 },
      { subjectCode: 'pc', hours: 4, cc: 4 },
      { subjectCode: 'svt', hours: 3, cc: 3 },
      ...COMMON({ info: [2, 2] }),
    ],
  },
  {
    trackCode: 'tc-lettres',
    rows: [
      { subjectCode: 'ar', hours: 5, cc: 5 },
      { subjectCode: 'fr', hours: 4, cc: 4 },
      { subjectCode: 'hg', hours: 4, cc: 4 },
      { subjectCode: 'angl', hours: 3, cc: 3 },
      { subjectCode: 'philo', hours: 2, cc: 2 },
      { subjectCode: 'islam', hours: 2, cc: 2 },
      { subjectCode: 'math', hours: 2, cc: 2 },
      { subjectCode: 'svt', hours: 1, cc: 1 },
      { subjectCode: 'info', hours: 2, cc: 2 },
      { subjectCode: 'eps', hours: 2, cc: 2 },
      { subjectCode: 'conduite', hours: 0, cc: 1 },
    ],
  },
  {
    // Le Tronc commun technologique n'existait pas au référentiel initial :
    // il est créé par l'import (cf. PRESET_TRACKS).
    trackCode: 'tc-techno',
    rows: [
      { subjectCode: 'math', hours: 5, cc: 5 },
      { subjectCode: 'pc', hours: 4, cc: 4 },
      { subjectCode: 'si', hours: 3, cc: 3 },
      ...COMMON({ info: [2, 2] }),
    ],
  },

  // ── 1ʳᵉ année Bac ────────────────────────────────────────────────────
  {
    trackCode: '1bac-sma',
    rows: [
      { subjectCode: 'math', hours: 7, cc: 7 },
      { subjectCode: 'pc', hours: 5, cc: 5 },
      { subjectCode: 'svt', hours: 3, cc: 3 },
      ...COMMON(),
    ],
  },
  {
    trackCode: '1bac-smb',
    rows: [
      { subjectCode: 'math', hours: 7, cc: 7 },
      { subjectCode: 'pc', hours: 5, cc: 5 },
      { subjectCode: 'si', hours: 3, cc: 3 },
      ...COMMON(),
    ],
  },
  {
    // « Sciences Expérimentales » du référentiel : le tenant l'a déclinée en
    // Sciences Physiques et SVT, qui partagent la même maquette horaire.
    trackCode: '1bac-sp',
    rows: [
      { subjectCode: 'math', hours: 5, cc: 5 },
      { subjectCode: 'pc', hours: 5, cc: 5 },
      { subjectCode: 'svt', hours: 5, cc: 5 },
      ...COMMON(),
    ],
  },
  {
    trackCode: '1bac-svt',
    rows: [
      { subjectCode: 'math', hours: 5, cc: 5 },
      { subjectCode: 'pc', hours: 5, cc: 5 },
      { subjectCode: 'svt', hours: 5, cc: 5 },
      ...COMMON(),
    ],
  },
  {
    trackCode: '1bac-eco',
    rows: [
      { subjectCode: 'eco', hours: 4, cc: 4 },
      { subjectCode: 'eoae', hours: 3, cc: 3 },
      { subjectCode: 'compta', hours: 4, cc: 4 },
      { subjectCode: 'math', hours: 4, cc: 4 },
      { subjectCode: 'droit', hours: 2, cc: 2 },
      ...COMMON(),
    ],
  },
  {
    trackCode: '1bac-tgc',
    rows: [
      { subjectCode: 'eco', hours: 4, cc: 4 },
      { subjectCode: 'eoae', hours: 3, cc: 3 },
      { subjectCode: 'compta', hours: 4, cc: 4 },
      { subjectCode: 'math', hours: 4, cc: 4 },
      { subjectCode: 'droit', hours: 2, cc: 2 },
      ...COMMON(),
    ],
  },
  {
    trackCode: '1bac-lettres',
    rows: [
      { subjectCode: 'ar', hours: 5, cc: 5 },
      { subjectCode: 'hg', hours: 4, cc: 4 },
      { subjectCode: 'fr', hours: 4, cc: 4 },
      { subjectCode: 'angl', hours: 4, cc: 4 },
      { subjectCode: 'philo', hours: 3, cc: 3 },
      { subjectCode: 'islam', hours: 2, cc: 2 },
      { subjectCode: 'math', hours: 2, cc: 2 },
      { subjectCode: 'eps', hours: 2, cc: 2 },
      { subjectCode: 'conduite', hours: 0, cc: 1 },
    ],
  },
  {
    trackCode: '1bac-sh',
    rows: [
      { subjectCode: 'ar', hours: 5, cc: 5 },
      { subjectCode: 'hg', hours: 4, cc: 4 },
      { subjectCode: 'fr', hours: 4, cc: 4 },
      { subjectCode: 'angl', hours: 4, cc: 4 },
      { subjectCode: 'philo', hours: 3, cc: 3 },
      { subjectCode: 'islam', hours: 2, cc: 2 },
      { subjectCode: 'math', hours: 2, cc: 2 },
      { subjectCode: 'eps', hours: 2, cc: 2 },
      { subjectCode: 'conduite', hours: 0, cc: 1 },
    ],
  },

  // ── 2ᵉ année Bac ─────────────────────────────────────────────────────
  {
    trackCode: '2bac-sma',
    rows: [
      { subjectCode: 'math', hours: 7, cc: 7 },
      { subjectCode: 'pc', hours: 5, cc: 5 },
      { subjectCode: 'svt', hours: 3, cc: 3 },
      ...COMMON(),
    ],
  },
  {
    trackCode: '2bac-smb',
    rows: [
      { subjectCode: 'math', hours: 7, cc: 7 },
      { subjectCode: 'pc', hours: 5, cc: 5 },
      // Option SMB : Sciences de l'Ingénieur remplace la SVT.
      { subjectCode: 'si', hours: 3, cc: 3 },
      ...COMMON(),
    ],
  },
  {
    trackCode: '2bac-sp',
    rows: [
      { subjectCode: 'pc', hours: 6, cc: 6 },
      { subjectCode: 'math', hours: 5, cc: 5 },
      { subjectCode: 'svt', hours: 5, cc: 5 },
      ...COMMON(),
    ],
  },
  {
    trackCode: '2bac-svt',
    rows: [
      { subjectCode: 'svt', hours: 6, cc: 6 },
      { subjectCode: 'math', hours: 5, cc: 5 },
      { subjectCode: 'pc', hours: 5, cc: 5 },
      ...COMMON(),
    ],
  },
  {
    trackCode: '2bac-eco',
    rows: [
      { subjectCode: 'eco', hours: 6, cc: 6 },
      { subjectCode: 'eoae', hours: 4, cc: 4 },
      { subjectCode: 'compta', hours: 4, cc: 4 },
      { subjectCode: 'math', hours: 4, cc: 4 },
      { subjectCode: 'droit', hours: 2, cc: 2 },
      ...COMMON(),
    ],
  },
  {
    trackCode: '2bac-tgc',
    rows: [
      { subjectCode: 'eco', hours: 6, cc: 6 },
      { subjectCode: 'eoae', hours: 3, cc: 3 },
      // Sciences de Gestion Comptable : la comptabilité y est renforcée.
      { subjectCode: 'compta', hours: 6, cc: 6 },
      { subjectCode: 'math', hours: 4, cc: 4 },
      { subjectCode: 'droit', hours: 2, cc: 2 },
      ...COMMON(),
    ],
  },
  {
    trackCode: '2bac-lettres',
    rows: [
      { subjectCode: 'ar', hours: 5, cc: 5 },
      { subjectCode: 'hg', hours: 4, cc: 4 },
      { subjectCode: 'philo', hours: 4, cc: 4 },
      { subjectCode: 'angl', hours: 4, cc: 4 },
      { subjectCode: 'fr', hours: 4, cc: 4 },
      { subjectCode: 'math', hours: 2, cc: 2 },
      { subjectCode: 'islam', hours: 2, cc: 2 },
      { subjectCode: 'eps', hours: 2, cc: 2 },
      { subjectCode: 'conduite', hours: 0, cc: 1 },
    ],
  },
  {
    trackCode: '2bac-sh',
    rows: [
      { subjectCode: 'ar', hours: 5, cc: 5 },
      { subjectCode: 'hg', hours: 4, cc: 4 },
      { subjectCode: 'philo', hours: 4, cc: 4 },
      { subjectCode: 'angl', hours: 4, cc: 4 },
      { subjectCode: 'fr', hours: 4, cc: 4 },
      { subjectCode: 'math', hours: 2, cc: 2 },
      { subjectCode: 'islam', hours: 2, cc: 2 },
      { subjectCode: 'eps', hours: 2, cc: 2 },
      { subjectCode: 'conduite', hours: 0, cc: 1 },
    ],
  },

  // ── Filières artistiques, agricoles et TC Économie ───────────────────
  //
  // Ces grilles diffèrent des précédentes sur deux points, conservés tels
  // quels : elles ne déclarent ni EPS ni Assiduité/Conduite, et le
  // coefficient de contrôle continu n'y suit plus le volume horaire
  // (Arabe 3 h pour coefficient 1 en Tronc commun Arts).
  {
    trackCode: 'tc-arts',
    rows: [
      // Au tronc commun la matière est « Arts plastiques » ; elle devient
      // « Arts appliqués » au Bac — deux matières distinctes au programme.
      { subjectCode: 'arts-pl', hours: 4, cc: 3 },
      { subjectCode: 'ar', hours: 3, cc: 1 },
      { subjectCode: 'fr', hours: 3, cc: 2 },
      { subjectCode: 'philo', hours: 2, cc: 1 },
      { subjectCode: 'angl', hours: 2, cc: 1 },
      { subjectCode: 'math', hours: 2, cc: 1 },
      { subjectCode: 'hg', hours: 2, cc: 1 },
      { subjectCode: 'islam', hours: 2, cc: 1 },
    ],
  },
  {
    trackCode: '1bac-arts',
    rows: [
      { subjectCode: 'arts', hours: 6, cc: 3 },
      { subjectCode: 'philo', hours: 3, cc: 2 },
      { subjectCode: 'fr', hours: 3, cc: 2 },
      { subjectCode: 'ar', hours: 2, cc: 1 },
      { subjectCode: 'angl', hours: 2, cc: 1 },
      { subjectCode: 'math', hours: 2, cc: 1 },
      { subjectCode: 'hg', hours: 2, cc: 1 },
      { subjectCode: 'islam', hours: 2, cc: 1 },
    ],
  },
  {
    trackCode: '2bac-arts',
    rows: [
      { subjectCode: 'arts', hours: 8, cc: 4 },
      { subjectCode: 'philo', hours: 3, cc: 2 },
      { subjectCode: 'fr', hours: 3, cc: 2 },
      { subjectCode: 'ar', hours: 2, cc: 1 },
      { subjectCode: 'angl', hours: 2, cc: 1 },
      { subjectCode: 'math', hours: 2, cc: 1 },
      // L'Histoire-Géographie disparaît en 2ᵉ Bac Arts.
      { subjectCode: 'islam', hours: 2, cc: 1 },
    ],
  },
  {
    trackCode: 'tc-agro',
    rows: [
      { subjectCode: 'svt', hours: 4, cc: 2 },
      { subjectCode: 'math', hours: 4, cc: 2 },
      { subjectCode: 'pc', hours: 3, cc: 2 },
      { subjectCode: 'ar', hours: 3, cc: 1 },
      { subjectCode: 'fr', hours: 3, cc: 2 },
      { subjectCode: 'philo', hours: 2, cc: 1 },
      { subjectCode: 'angl', hours: 2, cc: 1 },
      { subjectCode: 'hg', hours: 2, cc: 1 },
      { subjectCode: 'islam', hours: 2, cc: 1 },
    ],
  },
  {
    trackCode: '1bac-agro',
    rows: [
      { subjectCode: 'agro', hours: 5, cc: 3 },
      { subjectCode: 'svt', hours: 4, cc: 2 },
      { subjectCode: 'math', hours: 3, cc: 2 },
      { subjectCode: 'pc', hours: 3, cc: 2 },
      { subjectCode: 'ar', hours: 2, cc: 1 },
      { subjectCode: 'fr', hours: 2, cc: 2 },
      { subjectCode: 'philo', hours: 2, cc: 1 },
      { subjectCode: 'angl', hours: 2, cc: 1 },
      { subjectCode: 'islam', hours: 2, cc: 1 },
    ],
  },
  {
    trackCode: '2bac-agro',
    rows: [
      { subjectCode: 'agro', hours: 8, cc: 4 },
      { subjectCode: 'svt', hours: 4, cc: 3 },
      { subjectCode: 'math', hours: 3, cc: 2 },
      { subjectCode: 'pc', hours: 3, cc: 2 },
      { subjectCode: 'ar', hours: 2, cc: 1 },
      { subjectCode: 'fr', hours: 2, cc: 2 },
      { subjectCode: 'philo', hours: 2, cc: 1 },
      { subjectCode: 'angl', hours: 2, cc: 1 },
      { subjectCode: 'islam', hours: 2, cc: 1 },
    ],
  },
  {
    trackCode: 'tc-eco',
    rows: [
      { subjectCode: 'math', hours: 4, cc: 2 },
      { subjectCode: 'eco', hours: 3, cc: 2 },
      { subjectCode: 'compta', hours: 3, cc: 2 },
      { subjectCode: 'ar', hours: 3, cc: 1 },
      { subjectCode: 'fr', hours: 3, cc: 2 },
      { subjectCode: 'philo', hours: 2, cc: 1 },
      { subjectCode: 'angl', hours: 2, cc: 1 },
      { subjectCode: 'hg', hours: 2, cc: 1 },
      { subjectCode: 'islam', hours: 2, cc: 1 },
    ],
  },
];
