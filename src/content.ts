import type { Bi } from "./locale";

/**
 * Ground-truth content for the NNS 3D platform — fully bilingual.
 *
 * Every figure, list, spec and heading below is transcribed from the
 * company profile «النخلة الاهلية الامنية v1.1.pdf» (34 pages, re-extracted
 * 2026-11) — nothing invented. Arabic is the brand's first voice; English
 * strings use the profile's own English pages where they exist (solution
 * names, IVMS event names, hardware components) and faithful translations
 * elsewhere. Mono/uppercase strings are HUD instrument text and stay
 * English in both locales by design.
 */

export const BRAND = {
  nameAr: "النخلة الأمنية",
  nameEn: "ALNAKHLAH SECURITY",
  /** The verbatim site tagline (H1 on nns.com.sa). */
  taglineA: { ar: "تحكم في كل حركة", en: "Command every movement" },
  taglineB: { ar: "وتتبع بكفاءة وأمان", en: "track with efficiency & security" },
  sub: {
    ar: "حلول احترافية لإدارة الأساطيل وتتبع المركبات والكاميرات الذكية وإنترنت الأشياء — تماشيًا مع رؤية المملكة 2030.",
    en: "Professional fleet management, vehicle tracking, smart cameras and IoT solutions — aligned with Saudi Vision 2030.",
  },
  licenses: [
    {
      ar: "مرخصة من هيئة الاتصالات والفضاء والتقنية",
      en: "Licensed by the Communications, Space & Technology Commission",
    },
    {
      ar: "مرخصة من الهيئة العامة للنقل — ترخيص فئة (ب) AVL",
      en: "Licensed by the Transport General Authority — AVL class (B)",
    },
  ],
} as const satisfies {
  nameAr: string;
  nameEn: string;
  taglineA: Bi;
  taglineB: Bi;
  sub: Bi;
  licenses: readonly [Bi, Bi];
};

/** Company figures — verbatim from the profile's numbers page. */
export interface Stat {
  readonly value: number;
  readonly suffix: string;
  /** HUD instrument tag (mono, stays English). */
  readonly tag: string;
  readonly label: Bi;
}

export const STATS: readonly Stat[] = [
  { value: 5000, suffix: "", tag: "CONNECTED UNITS", label: { ar: "جهاز متصل", en: "connected devices" } },
  { value: 1_000_000, suffix: "+", tag: "MSG / DAY", label: { ar: "رسالة تُعالج يوميًا", en: "messages processed daily" } },
  { value: 100, suffix: "", tag: "CLIENTS", label: { ar: "عميل", en: "clients" } },
  { value: 20, suffix: "+", tag: "SPECIALISTS", label: { ar: "موظف محترف", en: "professional specialists" } },
];

/** Device teardown callouts — hardware families from the profile's solution
 *  component lists, each with a spec line sourced from the same pages
 *  (tracker tiers p12, FMS diagnostics p19, satellite failover p24,
 *  violations/alarms p16, panic button & immobilizer p12, harsh-conditions
 *  build p24). */
export interface PartCallout {
  readonly id: string;
  /** Mono label (instrument text, both locales). */
  readonly tag: string;
  readonly desc: Bi;
  /** Mono spec microline (instrument text, both locales). */
  readonly spec: string;
}

export const PART_CALLOUTS: readonly PartCallout[] = [
  {
    id: "gps",
    tag: "GPS MODULE",
    desc: { ar: "متتبع GPS متقدم — تحديد موقع عالي الدقة", en: "Advanced GPS tracker — high-precision positioning" },
    spec: "GPS · ADVANCED · ULTIMATE",
  },
  {
    id: "canbus",
    tag: "CANBUS / FMS",
    desc: { ar: "بوابة FMS وقراءة بيانات المحرك والوقود", en: "FMS gateway — engine, fuel & dashboard data" },
    spec: "ONBOARD DIAGNOSTICS · CO₂",
  },
  {
    id: "antenna",
    tag: "GSM + SAT LINK",
    desc: { ar: "اتصال خلوي وقمر صناعي خارج التغطية", en: "Cellular with satellite failover beyond coverage" },
    spec: "AUTO FAILOVER · GLOBAL",
  },
  {
    id: "pcb",
    tag: "SENSOR BUS",
    desc: { ar: "حرارة ورطوبة ووزن وأبواب وحزام", en: "Temperature, humidity, weight, doors & seatbelt" },
    spec: "15 VIOLATIONS · 25+ ALARMS",
  },
  {
    id: "battery",
    tag: "BACKUP CELL",
    desc: { ar: "بطارية احتياطية وزر طوارئ", en: "Backup battery with panic button" },
    spec: "SOS · IMMOBILIZER",
  },
  {
    id: "shell",
    tag: "SEALED SHELL",
    desc: { ar: "هيكل مقاوم للحرارة والغبار والاهتزاز", en: "Built for heat, dust, moisture & vibration" },
    spec: "ANTI-HARSH CONDITIONS",
  },
];

/** Operating cities (profile: «تغطية لكافة مناطق المملكة») with the same
 *  linear projection used across the project (lon/lat → 400×360 plane). */
export interface City {
  readonly id: string;
  readonly name: Bi;
  /** IATA-style mono code (instrument text). */
  readonly code: string;
  readonly x: number;
  readonly y: number;
  readonly hub?: boolean;
}

export const CITIES: readonly City[] = [
  { id: "riyadh", name: { ar: "الرياض", en: "Riyadh" }, code: "RUH", x: 227, y: 172, hub: true },
  { id: "jeddah", name: { ar: "جدة", en: "Jeddah" }, code: "JED", x: 87, y: 239 },
  { id: "dammam", name: { ar: "الدمام", en: "Dammam" }, code: "DMM", x: 290, y: 132 },
  { id: "abha", name: { ar: "أبها", en: "Abha" }, code: "AHB", x: 149, y: 311 },
  { id: "tabuk", name: { ar: "تبوك", en: "Tabuk" }, code: "TUU", x: 38, y: 90 },
];

/** Simplified Kingdom outline (same hand projection as the production radar). */
export const KSA_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [7.4, 69.8], [29.2, 72.2], [46.5, 54.5], [64.7, 43.6], [87.4, 8.7],
  [109.7, 13.1], [141.4, 30.5], [189.7, 71.9], [223.2, 74.1], [241.1, 76.3],
  [245.5, 91.6], [267.8, 106.8], [275.3, 119.9], [291.1, 130.8], [290.2, 152.6],
  [312.5, 172.2], [318.1, 179.9], [336.7, 209.3], [383.2, 215.2], [393.6, 228.9],
  [381.3, 272.5], [325.5, 294.3], [271.6, 303], [241.8, 335.7], [202.7, 331.4],
  [186.9, 328.7], [174.8, 346.6], [161.6, 344.4], [154.4, 351], [124.6, 303],
  [116.3, 283.4], [94.9, 255.1], [83.7, 240.9], [74.4, 216.9], [50.2, 179.9],
  [37.2, 154.8], [24.2, 128.6], [12.6, 109], [8.4, 95.9], [2.2, 97], [5.2, 82],
];

/** AI-IVMS detection set — Arabic from the Arabic IVMS page, English names
 *  verbatim from the profile's English "Bus Tracking and IVMS" page (p17). */
export interface AiGroup {
  readonly title: Bi;
  readonly tag: string;
  readonly items: readonly Bi[];
}

export const AI_EVENTS: { readonly dms: AiGroup; readonly adas: AiGroup } = {
  dms: {
    title: { ar: "مراقبة السائق DMS", en: "Driver Monitoring DMS" },
    tag: "IN-CABIN",
    items: [
      { ar: "إجهاد السائق", en: "Fatigue detection" },
      { ar: "التثاؤب", en: "Yawning detection" },
      { ar: "التشتت", en: "Distraction detection" },
      { ar: "استخدام الهاتف", en: "Calls detection" },
      { ar: "التدخين", en: "Smoking detection" },
      { ar: "حزام الأمان", en: "Seatbelt detection" },
      { ar: "غياب السائق", en: "No-driver detection" },
    ],
  },
  adas: {
    title: { ar: "مساعدة السائق ADAS", en: "Driver Assistance ADAS" },
    tag: "ROAD-FACING",
    items: [
      { ar: "مغادرة المسار", en: "Lane departure warning" },
      { ar: "الاصطدام الأمامي", en: "Forward collision warning" },
      { ar: "مسافة التتابع", en: "Following distance warning" },
      { ar: "الاصطدام بالمشاة", en: "Pedestrian collision warning" },
    ],
  },
};

/** Solution domains with the profile's own counts, a brand photo each, and
 *  three example solutions per domain from the profile's solution indexes
 *  (Smart Mobility p13, Industry 4.0 p8/25/26, Smart City p9–10,
 *  Construction p28). */
export interface Domain {
  readonly name: Bi;
  /** Mono tag (instrument text). */
  readonly tag: string;
  readonly count: number;
  readonly image: string;
  readonly solutions: readonly Bi[];
}

export const DOMAINS: readonly Domain[] = [
  {
    name: { ar: "النقل الذكي", en: "Smart Mobility" },
    tag: "SMART MOBILITY",
    count: 12,
    image: "/images/highway-pins.jpg",
    solutions: [
      { ar: "تتبع الحافلات و IVMS", en: "Bus tracking & IVMS" },
      { ar: "مراقبة سلسلة التبريد", en: "Cold-chain monitoring" },
      { ar: "تتبع عبر الأقمار الصناعية والطاقة الشمسية", en: "Satellite & solar tracking" },
    ],
  },
  {
    name: { ar: "القطاع الصناعي 4.0", en: "Industry 4.0" },
    tag: "INDUSTRY 4.0",
    count: 4,
    image: "/images/industry-robot.jpg",
    solutions: [
      { ar: "منع اصطدام الرافعات الشوكية", en: "Forklift collision prevention" },
      { ar: "إدارة المستودعات وساحات التشغيل", en: "Warehouse & yard management" },
      { ar: "مراقبة جودة الهواء والإشغال", en: "Air quality & occupancy" },
    ],
  },
  {
    name: { ar: "المدينة الذكية", en: "Smart City" },
    tag: "SMART CITY",
    count: 8,
    image: "/images/smart-city-night.jpg",
    solutions: [
      { ar: "إضاءة الشارع الذكية", en: "Smart street lighting" },
      { ar: "الموقف الذكي بالذكاء الاصطناعي", en: "AI smart parking" },
      { ar: "القياس الذكي وإدارة المخلفات", en: "Smart metering & waste management" },
    ],
  },
  {
    name: { ar: "تقنيات البناء والتشييد", en: "Construction Tech" },
    tag: "CONSTRUCTION TECH",
    count: 6,
    image: "/images/construction-site.jpg",
    solutions: [
      { ar: "الخوذة الذكية والعمال المتصلون", en: "Smart helmet & connected workers" },
      { ar: "سلامة الموقع بالذكاء الاصطناعي", en: "AI site-safety monitoring" },
      { ar: "نظام التحذير من الاقتراب PWAS", en: "Proximity warning alerts (PWAS)" },
    ],
  },
];

export const CONTACT = {
  phone: "920035355",
  email: "info@nns.com.sa",
  site: "alnakhlah.com.sa",
  address: {
    ar: "طريق الدائري الشرقي الفرعي، حي الريان، الرياض",
    en: "Eastern Ring Branch Rd, Ar Rayyan, Riyadh, Saudi Arabia",
  },
  labels: {
    call: { ar: "اتصل بنا", en: "Call us" },
    mail: { ar: "راسلنا", en: "Email us" },
    group: { ar: "المجموعة", en: "The group" },
  },
} as const;

/** Narrative copy per scroll section. */
export const COPY = {
  teardown: {
    kicker: "02 // HARDWARE TEARDOWN",
    h2a: { ar: "جهاز واحد.", en: "One device." },
    h2b: { ar: "منظومة كاملة.", en: "A complete system." },
    lead: {
      ar: "كل وحدة تتبع تحمل بداخلها عتاد المنصة بأكمله — موقع، محرك، حمولة، حرارة، واتصال لا ينقطع حتى خارج التغطية الخلوية.",
      en: "Every tracking unit carries the platform's full hardware — position, engine, load, temperature, and a link that holds beyond cellular coverage.",
    },
  },
  collar: {
    kicker: "03 // FIELD UNIT · ANIMAL TRACKING",
    h2a: { ar: "طوق التتبع الميداني.", en: "The field tracking collar." },
    h2b: { ar: "صُنع ليتحمّل.", en: "Built to endure." },
    lead: {
      ar: "تتبع لحظي للحيوانات والأصول في البيئات القاسية — سياج جغرافي، ومراقبة عن بُعد، واتصال بالأقمار الصناعية والطاقة الشمسية خارج التغطية.",
      en: "Real-time tracking for animals and assets in harsh environments — geo-fencing, remote monitoring, and satellite + solar connectivity beyond coverage.",
    },
  },
  network: {
    kicker: "04 // KINGDOM NETWORK",
    h2: { ar: "تغطية لكافة مناطق المملكة", en: "Coverage across the whole Kingdom" },
    lead: {
      ar: "خمس مدن تشغيل، ومركز قيادة واحد في الرياض.",
      en: "Five operating cities, one command center in Riyadh.",
    },
  },
  ai: {
    kicker: "05 // AI VISION · IVMS",
    h2a: { ar: "رؤية ترصد الخطر", en: "Vision that catches danger" },
    h2b: { ar: "قبل وقوعه.", en: "before it strikes." },
  },
  outro: {
    kicker: "06 // SOLUTIONS",
    h2: { ar: "ثلاثون حلًا في أربعة مجالات", en: "Thirty solutions across four domains" },
  },
  cue: { ar: "مرّر للاستكشاف", en: "Scroll to explore" },
} as const;

/** Smart security collar — the Wild Animal Tracking field unit. Modeled on
 *  the profile's own product photo (camel collar, p21 infographic): leather
 *  strap with rivets, metal buckle, curved tracking module. Specs from
 *  p21 (geo-fencing, sensor integration) and p12 (GPS · Solar · Satellite)
 *  and p24 (anti-harsh build factors). */
export const COLLAR_CALLOUTS: readonly PartCallout[] = [
  {
    id: "strap",
    tag: "LEATHER STRAP",
    desc: { ar: "سير جلدي مقوّى يتحمل البيئات القاسية", en: "Rugged leather strap for harsh environments" },
    spec: "FIELD-READY · ANTI-HARSH",
  },
  {
    id: "module",
    tag: "TRACKING UNIT",
    desc: { ar: "وحدة تتبع GPS بخيار الأقمار الصناعية والطاقة الشمسية", en: "GPS unit with satellite & solar options" },
    spec: "GPS · SOLAR · SATELLITE",
  },
  {
    id: "buckle",
    tag: "SECURE BUCKLE",
    desc: { ar: "إبزيم معدني محكم للتثبيت الآمن", en: "Secure metal buckle for safe fastening" },
    spec: "GEO-FENCE ALERTS",
  },
  {
    id: "plate",
    tag: "ARMOR PLATE",
    desc: { ar: "صفيحة معدنية مثبتة بمسامير للتقوية", en: "Riveted metal reinforcement plate" },
    spec: "VIBRATION · DUST · MOISTURE",
  },
];

/** Collar sensor-integration chips — verbatim set from the profile's Wild
 *  Animal Tracking page. */
export const COLLAR_SENSORS: readonly Bi[] = [
  { ar: "مستشعر التسارع", en: "Accelerometer" },
  { ar: "درجة الحرارة", en: "Temperature" },
  { ar: "معدل نبض القلب", en: "Heart rate" },
  { ar: "سياج جغرافي", en: "Geo-fencing" },
];

/** Scroll phase boundaries (fractions of total scroll). One source of truth
 *  shared by the camera rig, the scene and the DOM sections.
 *
 *  MUTABLE on purpose: `syncPhases()` (scroll.ts) re-derives each boundary
 *  from the actual section offsets after layout, fonts and resizes, so the
 *  3D beats stay locked to the copy that narrates them at any viewport
 *  height. The numbers below are only the pre-layout fallback. */
export const PHASES: {
  heroEnd: number;
  teardownEnd: number;
  collarEnd: number;
  networkEnd: number;
  aiEnd: number;
} = {
  heroEnd: 0.18,
  teardownEnd: 0.38,
  collarEnd: 0.58,
  networkEnd: 0.78,
  aiEnd: 0.95,
};

export const PHASE_LABELS: ReadonlyArray<{ readonly code: string; readonly name: Bi }> = [
  { code: "01 // DEVICE", name: { ar: "الجهاز", en: "Device" } },
  { code: "02 // HARDWARE", name: { ar: "العتاد", en: "Hardware" } },
  { code: "03 // SMART COLLAR", name: { ar: "الطوق الذكي", en: "Smart Collar" } },
  { code: "04 // NETWORK", name: { ar: "الشبكة", en: "Network" } },
  { code: "05 // AI VISION", name: { ar: "الذكاء", en: "AI Vision" } },
  { code: "06 // SOLUTIONS", name: { ar: "الحلول", en: "Solutions" } },
];
