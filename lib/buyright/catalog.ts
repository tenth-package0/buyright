export type ProfileId = "mac-m2" | "mac-m2-pro" | "windows-tb4" | "unknown";
export type ProductId =
  | "anker-575"
  | "plugable-tbt4"
  | "plugable-6950"
  | "unverified-dock";
export const CATALOG_VERSION = "2026-10-12.1";
export const profiles: Record<
  ProfileId,
  { label: string; short: string; nativeDisplays: number | null }
> = {
  "mac-m2": {
    label: "MacBook Air · M2 (2022)",
    short: "MacBook Air M2",
    nativeDisplays: 1,
  },
  "mac-m2-pro": {
    label: "MacBook Pro · M2 Pro (2023)",
    short: "MacBook Pro M2 Pro",
    nativeDisplays: 2,
  },
  "windows-tb4": {
    label: "Windows · verified Thunderbolt 4 host",
    short: "Windows TB4",
    nativeDisplays: 2,
  },
  unknown: {
    label: "Unknown host · needs specifications",
    short: "Unknown host",
    nativeDisplays: null,
  },
};
export const sources = {
  apple: {
    title: "Apple · MacBook Air M2 specifications",
    url: "https://support.apple.com/en-us/111867",
    quote: "One external display with up to 6K resolution at 60Hz",
    note: "Native display output is limited to one external display on this host.",
  },
  anker: {
    title: "Anker · 575 A8392 specifications",
    url: "https://www.anker.com/products/a8392",
    quote: "Single-4K@60Hz/ Dual-:2 x 4K@30Hz",
    note: "At two 4K displays, this model specifies 30Hz, not 60Hz. Host charging is rated at 85W.",
  },
  thunderbolt: {
    title: "Plugable · TBT4-UDZ display capabilities",
    url: "https://kb.plugable.com/en_US/docking-stations/what-are-the-display-output-capabilities-for-the-tbt4-udz",
    quote: "Are limited to a single 4K (3840x2160) 60Hz extended display",
    note: "The base M1/M2 exception limits this dock to one display. Supported Pro hosts need the documented port-group configuration.",
  },
  displaylink: {
    title: "Plugable · UD-6950PDZ documentation",
    url: "https://plugable.com/products/ud-6950pdz",
    quote: "DisplayLink Manager requires macOS screen recording permission",
    note: "DisplayLink supports additional displays using software. Its macOS setup requires software installation and screen-recording permission; host charging is up to 100W.",
  },
};
export type SourceId = keyof typeof sources;
export type Product = {
  id: ProductId;
  name: string;
  brand: string;
  subtitle: string;
  priceCents: number;
  powerWatts: number | null;
  technology: "mst" | "thunderbolt" | "displaylink" | "unknown";
  dual4k60: boolean | null;
  source: SourceId | null;
  label: string;
};
export const products: Product[] = [
  {
    id: "anker-575",
    name: "575 USB-C Dock",
    brand: "Anker",
    subtitle: "13 ports · USB-C · 85W",
    priceCents: 12900,
    powerWatts: 85,
    technology: "mst",
    dual4k60: false,
    source: "anker",
    label: "Budget choice",
  },
  {
    id: "plugable-tbt4",
    name: "TBT4-UDZ",
    brand: "Plugable",
    subtitle: "Thunderbolt 4 · 100W",
    priceCents: 22900,
    powerWatts: 100,
    technology: "thunderbolt",
    dual4k60: true,
    source: "thunderbolt",
    label: "No display driver",
  },
  {
    id: "plugable-6950",
    name: "UD-6950PDZ",
    brand: "Plugable",
    subtitle: "DisplayLink · 100W",
    priceCents: 19900,
    powerWatts: 100,
    technology: "displaylink",
    dual4k60: true,
    source: "displaylink",
    label: "Software required",
  },
  {
    id: "unverified-dock",
    name: "Unlisted USB-C Dock",
    brand: "Unverified",
    subtitle: "Missing manufacturer specifications",
    priceCents: 9900,
    powerWatts: null,
    technology: "unknown",
    dual4k60: null,
    source: null,
    label: "Evidence missing",
  },
];
export const productById = (id: ProductId) =>
  products.find((p) => p.id === id)!;
export const sampleFleet = [
  {
    id: "e1",
    name: "Alex Morgan",
    team: "Design",
    profile: "mac-m2-pro" as ProfileId,
    productId: "anker-575" as ProductId,
  },
  {
    id: "e2",
    name: "Sam Rivera",
    team: "Engineering",
    profile: "windows-tb4" as ProfileId,
    productId: "anker-575" as ProductId,
  },
  {
    id: "e3",
    name: "Jamie Chen",
    team: "Operations",
    profile: "mac-m2" as ProfileId,
    productId: "anker-575" as ProductId,
  },
  {
    id: "e4",
    name: "Taylor Brooks",
    team: "Design",
    profile: "mac-m2-pro" as ProfileId,
    productId: "anker-575" as ProductId,
  },
  {
    id: "e5",
    name: "Jordan Lee",
    team: "Engineering",
    profile: "windows-tb4" as ProfileId,
    productId: "anker-575" as ProductId,
  },
  {
    id: "e6",
    name: "Casey Patel",
    team: "Operations",
    profile: "mac-m2" as ProfileId,
    productId: "anker-575" as ProductId,
  },
];
