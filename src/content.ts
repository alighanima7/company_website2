import type { Bi } from "./locale";
import type { ProductId } from "./productState";
import type { Route } from "./router";

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
    image: "/images/highway-pins.webp",
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
    image: "/images/industry-robot.webp",
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
    image: "/images/smart-city-night.webp",
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
    image: "/images/construction-site.webp",
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
  city: {
    kicker: "04 // SMART CITY · IOT",
    h2a: { ar: "مدينة كاملة،", en: "An entire city," },
    h2b: { ar: "تُدار بذكاء.", en: "managed intelligently." },
    lead: {
      ar: "إنترنت الأشياء في كل زاوية — مبانٍ تُحسّن طاقتها، مواقف تُرشد سائقيها، إنارة تُدار عن بُعد، ومخلفات وعدادات تُراقب لحظيًا.",
      en: "IoT on every corner — buildings optimizing their energy, parking guiding drivers, remotely managed lighting, and waste & meters monitored in real time.",
    },
  },
  network: {
    kicker: "05 // KINGDOM NETWORK",
    h2: { ar: "تغطية لكافة مناطق المملكة", en: "Coverage across the whole Kingdom" },
    lead: {
      ar: "خمس مدن تشغيل، ومركز قيادة واحد في الرياض.",
      en: "Five operating cities, one command center in Riyadh.",
    },
  },
  ai: {
    kicker: "06 // AI VISION · IVMS",
    h2a: { ar: "رؤية ترصد الخطر", en: "Vision that catches danger" },
    h2b: { ar: "قبل وقوعه.", en: "before it strikes." },
  },
  outro: {
    kicker: "07 // SOLUTIONS",
    h2: { ar: "ثلاثون حلًا في أربعة مجالات", en: "Thirty solutions across four domains" },
  },
  /** Scroll invitation under the Home hero (the depth film's cue). */
  cue: { ar: "مرّر للاستكشاف", en: "Scroll to explore" },
  /** Shown if the WebGL context is lost and the browser can't restore it. */
  glLost: { ar: "توقّف العرض ثلاثي الأبعاد — اضغط لإعادة التحميل", en: "3D view paused — tap to reload" },
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

/** Smart City pillars — from the profile's Smart City pages (p9–10, p26):
 *  smart building energy/lighting, AI parking with guidance + mobile app,
 *  remotely scheduled street lighting, waste fill-level + route
 *  optimization, metering and inspection-chamber monitoring. */
export const CITY_CALLOUTS: readonly PartCallout[] = [
  {
    id: "building",
    tag: "SMART BUILDING",
    desc: { ar: "إنترنت الأشياء لرفع كفاءة المبنى وترشيد الطاقة", en: "IoT raising building efficiency & saving energy" },
    spec: "ENERGY · SMART LIGHTING",
  },
  {
    id: "parking",
    tag: "SMART PARKING",
    desc: { ar: "رؤية لحظية للمواقف الشاغرة وتقليل الازدحام", en: "Real-time occupancy view, less congestion" },
    spec: "AI GUIDANCE · MOBILE APP",
  },
  {
    id: "lighting",
    tag: "STREET LIGHTING",
    desc: { ar: "تحكم عن بُعد بالإنارة وجدولة التشغيل", en: "Remote lighting control & scheduling" },
    spec: "REMOTE · SUSTAINABLE",
  },
  {
    id: "waste",
    tag: "WASTE + METERING",
    desc: { ar: "مراقبة الحاويات والعدادات وغرف التفتيش لحظيًا", en: "Bins, meters & inspection chambers monitored live" },
    spec: "FILL LEVEL · ROUTE OPT",
  },
];

/** The remaining Smart City services, as section chips (p9–10). */
export const CITY_FEATURES: readonly Bi[] = [
  { ar: "جودة الهواء الداخلي", en: "Indoor air quality" },
  { ar: "محطة الطقس والبيئة", en: "Weather & environment" },
  { ar: "غرف التفتيش", en: "Inspection chambers" },
  { ar: "القياس الذكي", en: "Smart metering" },
];

/* ════════════════════════════════════════════════════════════════════════
   Multi-page app content — navigation, the three sub-pages, and the forms.
   Same ground rules as everything above: bilingual throughout, specs and
   figures only from the company profile; the offers below package REAL
   solutions from the profile's indexes and deliberately carry no invented
   prices (quotes go through the request form).
   ════════════════════════════════════════════════════════════════════════ */

export interface NavItem {
  readonly route: Route;
  readonly label: Bi;
  /** Mono index chip (instrument text). */
  readonly tag: string;
}

export const NAV: readonly NavItem[] = [
  { route: "home", label: { ar: "الرئيسية", en: "Home" }, tag: "01" },
  { route: "products", label: { ar: "المنتجات", en: "Products" }, tag: "02" },
  { route: "support", label: { ar: "الدعم الفني", en: "Support" }, tag: "03" },
  { route: "requests", label: { ar: "الطلبات والعروض", en: "Requests & About" }, tag: "04" },
];

export const PAGE_TITLES: Record<Route, Bi> = {
  home: { ar: "النخلة الأمنية — الرئيسية", en: "ALNAKHLAH SECURITY — Home" },
  products: { ar: "النخلة الأمنية — المنتجات", en: "ALNAKHLAH SECURITY — Products" },
  support: { ar: "النخلة الأمنية — الدعم الفني", en: "ALNAKHLAH SECURITY — Support" },
  requests: {
    ar: "النخلة الأمنية — الطلبات والعروض ومن نحن",
    en: "ALNAKHLAH SECURITY — Requests, Offers & About",
  },
};

/** The Home map block narrates the Kingdom network (same profile page the
 *  old network act used). */
export const HOME_MAP = {
  kicker: "02 // KINGDOM NETWORK",
  h2: { ar: "تغطية لكافة مناطق المملكة", en: "Coverage across the whole Kingdom" },
  lead: {
    ar: "خمس مدن تشغيل، ومركز قيادة واحد في الرياض — بنية تتبع واحدة من الخليج إلى البحر الأحمر.",
    en: "Five operating cities and one command center in Riyadh — a single tracking fabric from the Gulf to the Red Sea.",
  },
} as const;

/* ── Products page ──────────────────────────────────────────────────── */

/** FMC130 — the compact vehicle terminal. Its GLB ships four REAL part
 *  nodes (front/back housings, side port, base rail), so the products
 *  page runs a true scroll-driven exploded view on it. Part descriptions
 *  state what the 3D parts physically are; every spec microline is a
 *  [TODO] placeholder until the content owner supplies profile-sourced
 *  figures. */
export const FMC130_CALLOUTS: readonly PartCallout[] = [
  {
    id: "f130-front",
    tag: "FRONT HOUSING",
    desc: { ar: "الغطاء الأمامي — يحمل لوحة بيانات الجهاز", en: "Front housing — carries the device label plate" },
    spec: "[TODO] SPEC",
  },
  {
    id: "f130-back",
    tag: "BACK HOUSING",
    desc: { ar: "الغطاء الخلفي محكم الإغلاق", en: "Sealed back housing" },
    spec: "[TODO] SPEC",
  },
  {
    id: "f130-port",
    tag: "SIDE PORT",
    desc: { ar: "منفذ جانبي للتوصيل والصيانة", en: "Side connector & service port" },
    spec: "[TODO] SPEC",
  },
  {
    id: "f130-rail",
    tag: "BASE RAIL",
    desc: { ar: "قاعدة التثبيت السفلية", en: "Bottom mounting rail" },
    spec: "[TODO] SPEC",
  },
];

/** FMC920 — the plug-and-track unit. Its GLB splits into the sealed unit,
 *  the vehicle power harness coiled behind it and the quick connector
 *  pieces — the exploded view reads as the unit unplugging from its
 *  install harness. Same [TODO] rule as above. */
export const FMC920_CALLOUTS: readonly PartCallout[] = [
  {
    id: "f920-unit",
    tag: "TRACKING UNIT",
    desc: { ar: "وحدة التتبع المدمجة", en: "The sealed tracking unit" },
    spec: "[TODO] SPEC",
  },
  {
    id: "f920-harness",
    tag: "POWER HARNESS",
    desc: { ar: "ضفيرة التوصيل بطاقة المركبة", en: "Vehicle power wiring harness" },
    spec: "[TODO] SPEC",
  },
  {
    id: "f920-plug",
    tag: "QUICK CONNECTOR",
    desc: { ar: "موصل سريع الفصل للتركيب", en: "Quick-release install connector" },
    spec: "[TODO] SPEC",
  },
];

/** Galileosky — the GLB ships SIX mesh nodes, but they are three distinct
 *  things: one main housing, four identical fittings on one end face, and
 *  a single fitting on the opposite end. All six separate in the exploded
 *  view; only the three real types carry a callout (the three duplicate
 *  fittings travel without a chip, exactly as FMC920's fourth node does).
 *  Part names describe what is observably in the model — every spec is a
 *  [TODO] until the content owner supplies profile-sourced figures. */
export const GALILEOSKY_CALLOUTS: readonly PartCallout[] = [
  {
    id: "gsky-housing",
    tag: "[TODO] HOUSING",
    desc: { ar: "[TODO] الهيكل الرئيسي للجهاز", en: "[TODO] Main device housing" },
    spec: "[TODO] SPEC",
  },
  {
    id: "gsky-fitting",
    tag: "[TODO] END FITTINGS",
    desc: { ar: "[TODO] أربع وصلات في أركان الطرف الخلفي", en: "[TODO] Four fittings at the rear end corners" },
    spec: "[TODO] SPEC",
  },
  {
    id: "gsky-connector",
    tag: "[TODO] FRONT CONNECTOR",
    desc: { ar: "[TODO] وصلة الطرف الأمامي", en: "[TODO] Front end connector" },
    spec: "[TODO] SPEC",
  },
];

/** Galileosky 10 — a single merged mesh with no part split, so it gets a
 *  static presentation with a gentle turn rather than a faked teardown.
 *  These rows are spec-table placeholders only; they anchor nothing in 3D
 *  and every one is a [TODO] awaiting real figures. */
export const GALILEOSKY10_CALLOUTS: readonly PartCallout[] = [
  {
    id: "gsky10-spec-1",
    tag: "[TODO] SPEC ROW 1",
    desc: { ar: "[TODO] وصف المواصفة الأولى", en: "[TODO] First specification" },
    spec: "[TODO] SPEC",
  },
  {
    id: "gsky10-spec-2",
    tag: "[TODO] SPEC ROW 2",
    desc: { ar: "[TODO] وصف المواصفة الثانية", en: "[TODO] Second specification" },
    spec: "[TODO] SPEC",
  },
  {
    id: "gsky10-spec-3",
    tag: "[TODO] SPEC ROW 3",
    desc: { ar: "[TODO] وصف المواصفة الثالثة", en: "[TODO] Third specification" },
    spec: "[TODO] SPEC",
  },
];

export interface Product {
  readonly id: ProductId;
  readonly name: Bi;
  /** Mono spec strip under the name. */
  readonly tag: string;
  /** Mono kicker WITHOUT its number — the leading "NN // " is composed from
   *  the product's position in VISIBLE_PRODUCTS at render time, so the
   *  kickers, the rail and the "NN / NN" counter can never disagree and
   *  hiding or adding a product renumbers the lineup by itself. */
  readonly kickerLabel: string;
  readonly blurb: Bi;
  /** Spec table rows (the same hardware families the 3D callouts cite). */
  readonly callouts: readonly PartCallout[];
  /** Optional capability chips. */
  readonly chips?: readonly Bi[];
  /**
   * THE SWITCH. Set to true to take a product off the site completely:
   * it leaves the browse sequence, the rail, the counter, the support
   * ticket picker and the set of valid `#/products/<id>` routes, and its
   * 3D scene is never mounted. Nothing is deleted — flip the flag back
   * and the product returns, renumbered automatically.
   */
  readonly hidden?: boolean;
}

export const PRODUCTS: readonly Product[] = [
  {
    id: "tracker",
    name: { ar: "جهاز التتبع المتقدم", en: "Advanced Tracking Unit" },
    tag: "AVL · FMS · SATELLITE",
    kickerLabel: "TRACKING HARDWARE",
    blurb: COPY.teardown.lead,
    callouts: PART_CALLOUTS,
  },
  {
    // ── HIDDEN (reversible) ──────────────────────────────────────────
    // Delete the `hidden` line below to bring the field collar back. Its
    // content, callouts, sensor chips, theme tokens and the procedural
    // Collar3D scene are all still here and still referenced — nothing
    // was removed, and the lineup renumbers itself on the way back in.
    hidden: true,
    id: "collar",
    name: { ar: "طوق التتبع الميداني", en: "Field Tracking Collar" },
    tag: "GPS · SOLAR · SATELLITE",
    kickerLabel: "FIELD UNIT",
    blurb: COPY.collar.lead,
    callouts: COLLAR_CALLOUTS,
    chips: COLLAR_SENSORS,
  },
  {
    id: "city",
    name: { ar: "منظومة المدينة الذكية", en: "Smart City Platform" },
    tag: "IOT · CITY OPERATIONS",
    kickerLabel: "SMART CITY",
    blurb: COPY.city.lead,
    callouts: CITY_CALLOUTS,
    chips: CITY_FEATURES,
  },
  {
    id: "fmc130",
    name: { ar: "جهاز FMC130", en: "FMC130 Terminal" },
    tag: "[TODO] TAG LINE",
    kickerLabel: "VEHICLE TERMINAL",
    blurb: {
      ar: "[TODO] وصف تعريفي قصير لجهاز FMC130 — مرّر للأسفل لتفكيك الجهاز قطعةً قطعة.",
      en: "[TODO] Short introduction for the FMC130 terminal — scroll to take the unit apart piece by piece.",
    },
    callouts: FMC130_CALLOUTS,
  },
  {
    id: "fmc920",
    name: { ar: "جهاز FMC920", en: "FMC920 Tracker" },
    tag: "[TODO] TAG LINE",
    kickerLabel: "COMPACT TRACKER",
    blurb: {
      ar: "[TODO] وصف تعريفي قصير لجهاز FMC920 — مرّر للأسفل لفصل الوحدة عن ضفيرة التوصيل.",
      en: "[TODO] Short introduction for the FMC920 tracker — scroll to unplug the unit from its install harness.",
    },
    callouts: FMC920_CALLOUTS,
  },
  {
    id: "galileosky",
    name: { ar: "جهاز Galileosky", en: "Galileosky Terminal" },
    tag: "[TODO] TAG LINE",
    kickerLabel: "[TODO] GALILEOSKY",
    blurb: {
      ar: "[TODO] وصف تعريفي قصير لجهاز Galileosky — مرّر للأسفل لتفكيك الجهاز قطعةً قطعة.",
      en: "[TODO] Short introduction for the Galileosky terminal — scroll to take the unit apart piece by piece.",
    },
    callouts: GALILEOSKY_CALLOUTS,
  },
  {
    id: "galileosky10",
    name: { ar: "جهاز Galileosky 10", en: "Galileosky 10" },
    tag: "[TODO] TAG LINE",
    kickerLabel: "[TODO] GALILEOSKY 10",
    blurb: {
      ar: "[TODO] وصف تعريفي قصير لجهاز Galileosky 10.",
      en: "[TODO] Short introduction for the Galileosky 10.",
    },
    callouts: GALILEOSKY10_CALLOUTS,
  },
];

/** The lineup the site actually shows. EVERY list derives from this one:
 *  the browse sequence, the rail, the "NN / NN" counter, the support
 *  ticket picker, the valid `#/products/<id>` routes and which 3D scene
 *  may mount. Hidden products keep their data and their scene — they are
 *  simply not in here. */
export const VISIBLE_PRODUCTS: readonly Product[] = PRODUCTS.filter((p) => p.hidden !== true);

/** A hidden product's id is not a route: `#/products/collar` takes exactly
 *  the same path as `#/products/not-a-thing` and lands on the sequence. */
export function isVisibleProductId(value: string): value is ProductId {
  return VISIBLE_PRODUCTS.some((p) => p.id === value);
}

/** "03 // VEHICLE TERMINAL" — the number comes from the VISIBLE position,
 *  never from the data, so it cannot drift out of step with the rail. */
export function productKicker(product: Product): string {
  const index = VISIBLE_PRODUCTS.findIndex((p) => p.id === product.id);
  return `${String(index + 1).padStart(2, "0")} // ${product.kickerLabel}`;
}

export const PRODUCTS_PAGE = {
  kicker: "02 // PRODUCT LINEUP",
  h2: { ar: "عتاد المنصة، قطعةً قطعة", en: "The platform's hardware, piece by piece" },
  /** Deliberately carries NO product count: a literal number here goes
   *  stale every time a product is hidden or added. */
  lead: {
    ar: "عتاد يغطي المركبة والمدينة — اختر منتجًا لاستكشافه ثلاثي الأبعاد.",
    en: "Hardware covering vehicle and city — pick a product to inspect it in 3D.",
  },
  switchLabel: { ar: "اختيار المنتج", en: "Select product" },
  specsTitle: { ar: "المواصفات", en: "Specifications" },
  /** Browse → detail, and the way back. UI chrome for the two new
   *  controls; no product copy is implied by either. */
  detailsCta: { ar: "عرض التفاصيل", en: "View details" },
  backCta: { ar: "العودة إلى المنتجات", en: "Back to products" },
  /** Scroll invitation + a11y name for the FMC exploded-view track. */
  explodeCue: { ar: "مرّر لتفكيك الجهاز — والعودة تعيد تجميعه", en: "Scroll to take it apart — scroll back to reassemble" },
  viewerLabel: { ar: "عرض ثلاثي الأبعاد تفاعلي يتفكك مع التمرير", en: "Interactive 3D exploded view driven by scroll" },
} as const;

/* ── Technical Support page ─────────────────────────────────────────── */

export const SUPPORT_PAGE = {
  kicker: "03 // TECHNICAL SUPPORT",
  h2: { ar: "الدعم الفني", en: "Technical Support" },
  lead: {
    ar: "فريق متخصص يرافقك من التركيب إلى التشغيل — قنوات مباشرة، وأسئلة شائعة، ونموذج تذكرة يصل إلى فريق العمليات.",
    en: "A specialist team from installation to operations — direct channels, FAQs, and a ticket form that reaches our operations desk.",
  },
  channelsTitle: { ar: "قنوات مباشرة", en: "Direct channels" },
  faqTitle: { ar: "أسئلة شائعة", en: "Frequently asked questions" },
  formTitle: { ar: "فتح تذكرة دعم", en: "Open a support ticket" },
  formLead: {
    ar: "عبّئ البيانات التالية وسيتولى الفريق المختص تذكرتك بحسب أولويتها.",
    en: "Fill in the details below and the right team will pick up your ticket by priority.",
  },
} as const;

/** FAQs — every answer restates profile facts (coverage, failover, IVMS,
 *  licensing, anti-harsh build, team). */
export const FAQS: ReadonlyArray<{ readonly q: Bi; readonly a: Bi }> = [
  {
    q: { ar: "ما نطاق التغطية داخل المملكة؟", en: "What is the coverage across Saudi Arabia?" },
    a: {
      ar: "تغطية لكافة مناطق المملكة عبر خمس مدن تشغيل — الرياض وجدة والدمام وأبها وتبوك — ومركز قيادة واحد في الرياض.",
      en: "Coverage across all regions through five operating cities — Riyadh, Jeddah, Dammam, Abha and Tabuk — with one command center in Riyadh.",
    },
  },
  {
    q: { ar: "ماذا يحدث خارج التغطية الخلوية؟", en: "What happens beyond cellular coverage?" },
    a: {
      ar: "أجهزتنا تدعم التحويل التلقائي إلى الاتصال عبر الأقمار الصناعية، مع خيارات الطاقة الشمسية لوحدات الميدان — فلا ينقطع التتبع.",
      en: "Our units fail over automatically to satellite connectivity, with solar options for field units — tracking never drops.",
    },
  },
  {
    q: { ar: "ما الذي ترصده المنصة من مخالفات وتنبيهات؟", en: "What violations and alarms does the platform detect?" },
    a: {
      ar: "١٥ نوع مخالفة وأكثر من ٢٥ تنبيهًا — من السرعة والحرارة إلى أحداث رؤية السائق DMS/ADAS مثل الإجهاد ومغادرة المسار.",
      en: "15 violation types and 25+ alarms — from speed and temperature to DMS/ADAS vision events like fatigue and lane departure.",
    },
  },
  {
    q: { ar: "هل تتحمل الأجهزة البيئات القاسية؟", en: "Do the devices survive harsh environments?" },
    a: {
      ar: "نعم — تصميم مقاوم للحرارة والغبار والرطوبة والاهتزاز، مثبت ميدانيًا في مواقع الإنشاء والصحراء والمناطق الصناعية.",
      en: "Yes — built against heat, dust, moisture and vibration, field-proven on construction, desert and industrial sites.",
    },
  },
  {
    q: { ar: "هل الشركة مرخصة؟", en: "Is the company licensed?" },
    a: {
      ar: "مرخصة من هيئة الاتصالات والفضاء والتقنية، ومن الهيئة العامة للنقل بترخيص فئة (ب) لخدمات التتبع AVL.",
      en: "Licensed by the Communications, Space & Technology Commission, and by the Transport General Authority with an AVL class (B) license.",
    },
  },
  {
    q: { ar: "من يتولى التركيب والتفعيل؟", en: "Who handles installation and activation?" },
    a: {
      ar: "فريقنا — أكثر من ٢٠ موظفًا محترفًا يتولون التركيب والتفعيل وربط الأجهزة بالمنصة وتدريب فريقك عليها.",
      en: "Our team — 20+ professional specialists handle installation, activation, platform onboarding and training.",
    },
  },
];

/* ── Shared form vocabulary ─────────────────────────────────────────── */

export const FORM = {
  name: { ar: "الاسم الكامل", en: "Full name" },
  company: { ar: "الشركة / الجهة", en: "Company / organization" },
  email: { ar: "البريد الإلكتروني", en: "Email" },
  phone: { ar: "رقم الجوال (اختياري)", en: "Phone (optional)" },
  product: { ar: "المنتج / الجهاز", en: "Product / device" },
  category: { ar: "نوع المشكلة", en: "Issue category" },
  priority: { ar: "الأولوية", en: "Priority" },
  message: { ar: "وصف الحالة", en: "Describe the issue" },
  messagePlaceholder: {
    ar: "رقم الوحدة إن وُجد، ومتى بدأت المشكلة، وما الذي جربته…",
    en: "Unit number if any, when it started, what you tried…",
  },
  submitTicket: { ar: "إرسال التذكرة", en: "Submit ticket" },
  submitRequest: { ar: "إرسال الطلب", en: "Submit request" },
  required: { ar: "هذا الحقل مطلوب", en: "This field is required" },
  badEmail: { ar: "يرجى إدخال بريد إلكتروني صحيح", en: "Please enter a valid email" },
  select: { ar: "اختر…", en: "Select…" },
  otherProduct: { ar: "أخرى / غير مدرج", en: "Other / not listed" },
  refLabel: "REF",
  confirmTicketTitle: { ar: "تم تسجيل التذكرة", en: "Ticket recorded" },
  confirmRequestTitle: { ar: "تم تسجيل الطلب", en: "Request recorded" },
  confirmBody: {
    ar: "احتفظ بالمرجع أدناه، ثم أكمل الإرسال عبر البريد ليصل مباشرة إلى الفريق المختص.",
    en: "Keep the reference below, then finish by sending it via email so it lands with the right team.",
  },
  mailCta: { ar: "إرسال عبر البريد", en: "Send via email" },
  resetTicket: { ar: "تذكرة جديدة", en: "New ticket" },
  resetRequest: { ar: "طلب جديد", en: "New request" },
} as const;

export const TICKET_CATEGORIES: readonly Bi[] = [
  { ar: "التركيب والتفعيل", en: "Installation & activation" },
  { ar: "المنصة والتقارير", en: "Platform & reports" },
  { ar: "الإشارة والتتبع", en: "Signal & tracking" },
  { ar: "الفوترة والاشتراك", en: "Billing & subscription" },
  { ar: "أخرى", en: "Other" },
];

export const TICKET_PRIORITIES: readonly Bi[] = [
  { ar: "منخفضة", en: "Low" },
  { ar: "عادية", en: "Normal" },
  { ar: "عالية", en: "High" },
  { ar: "حرجة", en: "Critical" },
];

/* ── Requests, Offers & About page ──────────────────────────────────── */

export const ABOUT = {
  kicker: "04 // ABOUT US",
  h2: { ar: "من نحن", en: "About us" },
  mission: {
    ar: "النخلة الأهلية الأمنية شركة سعودية متخصصة في إدارة الأساطيل وتتبع المركبات والكاميرات الذكية وإنترنت الأشياء — نبني منظومات تتبع احترافية تمنح عملاءنا تحكمًا كاملًا في كل حركة، تماشيًا مع رؤية المملكة 2030.",
    en: "ALNAKHLAH Security is a Saudi company specialized in fleet management, vehicle tracking, smart cameras and IoT — building professional tracking systems that give our clients command of every movement, in line with Saudi Vision 2030.",
  },
  body: {
    ar: "من مركز القيادة في الرياض يدير فريقنا — أكثر من ٢٠ مختصًا — آلاف الأجهزة المتصلة عبر خمس مدن تشغيل، على عتاد مصمم للبيئات القاسية واتصال لا ينقطع حتى خارج التغطية الخلوية.",
    en: "From the Riyadh command center our team of 20+ specialists operates thousands of connected devices across five cities, on hardware engineered for harsh environments with connectivity that holds beyond cellular coverage.",
  },
  capsTitle: { ar: "بالأرقام", en: "By the numbers" },
  domainsTitle: { ar: "مجالات الحلول", en: "Solution domains" },
} as const;

export interface Offer {
  readonly tag: string;
  readonly name: Bi;
  readonly desc: Bi;
  readonly features: readonly Bi[];
}

export const OFFERS_PAGE = {
  kicker: "05 // OFFERS",
  h2: { ar: "العروض والباقات", en: "Offers & packages" },
  lead: {
    ar: "باقات مبنية من حلول المنصة الفعلية — الأسعار بحسب حجم الأسطول ومدة الاشتراك، واطلب عرضًا مخصصًا من النموذج أدناه.",
    en: "Packages built from the platform's real solutions — pricing follows fleet size and term; request a tailored quote below.",
  },
  cta: { ar: "اطلب عرض سعر", en: "Request a quote" },
} as const;

export const OFFERS: readonly Offer[] = [
  {
    tag: "FLEET STARTER",
    name: { ar: "الأسطول الناشئ", en: "Fleet Starter" },
    desc: {
      ar: "حتى ٢٥ مركبة — انطلاقة سريعة إلى التتبع الاحترافي.",
      en: "Up to 25 vehicles — a fast start into professional tracking.",
    },
    features: [
      { ar: "جهاز تتبع متقدم لكل مركبة", en: "Advanced tracker per vehicle" },
      { ar: "منصة المراقبة والتقارير", en: "Monitoring & reports platform" },
      { ar: "تنبيهات المخالفات لحظيًا", en: "Real-time violation alerts" },
    ],
  },
  {
    tag: "ENTERPRISE FLEET",
    name: { ar: "أسطول المؤسسات", en: "Enterprise Fleet" },
    desc: {
      ar: "للأساطيل الكبيرة — رؤية كاملة وسلامة سائقين بالذكاء الاصطناعي.",
      en: "For large fleets — full visibility and AI driver safety.",
    },
    features: [
      { ar: "كاميرات IVMS بتقنيتي DMS و ADAS", en: "IVMS cameras with DMS & ADAS" },
      { ar: "تحويل تلقائي للأقمار الصناعية خارج التغطية", en: "Satellite failover beyond coverage" },
      { ar: "مراقبة سلسلة التبريد", en: "Cold-chain monitoring" },
      { ar: "دعم مخصص", en: "Dedicated support" },
    ],
  },
  {
    tag: "SMART SITE & CITY",
    name: { ar: "المواقع والمدن الذكية", en: "Smart Site & City" },
    desc: {
      ar: "إنترنت الأشياء للمنشآت والمدن — من الإنارة إلى العدادات.",
      en: "IoT for facilities and cities — from lighting to metering.",
    },
    features: [
      { ar: "إضاءة شوارع ومواقف ذكية", en: "Smart street lighting & parking" },
      { ar: "قياس ذكي وإدارة مخلفات", en: "Smart metering & waste management" },
      { ar: "الخوذة الذكية وسلامة المواقع", en: "Smart helmets & site safety" },
    ],
  },
];

export const REQUESTS_PAGE = {
  kicker: "06 // SUBMIT A REQUEST",
  h2: { ar: "تقديم الطلبات", en: "Submit a request" },
  lead: {
    ar: "عرض سعر، طلب كمية، أو مقترح شراكة — عبّئ النموذج وسيصلك رد الفريق التجاري.",
    en: "A quote, a bulk order, or a partnership proposal — fill in the form and our commercial team will respond.",
  },
  typeLabel: { ar: "نوع الطلب", en: "Request type" },
  types: [
    { ar: "عرض سعر", en: "Quote" },
    { ar: "طلب كمية / تجاري", en: "Bulk / commercial order" },
    { ar: "شراكة", en: "Partnership" },
  ] as readonly Bi[],
  fleetLabel: { ar: "حجم الأسطول / الوحدات", en: "Fleet / unit count" },
  fleetSizes: ["1–10", "11–50", "51–200", "200+"] as readonly string[],
  domainLabel: { ar: "مجال الحل", en: "Solution domain" },
  detailsLabel: { ar: "تفاصيل الطلب", en: "Request details" },
  detailsPlaceholder: {
    ar: "نوع المركبات أو المواقع، المدن، الجدول الزمني المتوقع…",
    en: "Vehicle or site types, cities, expected timeline…",
  },
} as const;
