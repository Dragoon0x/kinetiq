/**
 * The shape of one searchable record, shared by the build script that writes
 * the index and the command deck that reads it.
 *
 * Keys are single letters because this file ships to the browser: at ~700
 * records, full field names cost more than the rest of the payload. The
 * index is fetched on demand rather than imported, so nothing here lands in
 * a page bundle.
 */
export type SearchSection =
  "component" | "block" | "page" | "template" | "lab" | "guide" | "site";

/** Section codes, shortest first — see the note about payload size above. */
export const SECTION_CODES = {
  c: "component",
  b: "block",
  p: "page",
  t: "template",
  l: "lab",
  g: "guide",
  x: "site",
} as const satisfies Record<string, SearchSection>;

export type SectionCode = keyof typeof SECTION_CODES;

export type SearchDoc = {
  /** Section code; expand through SECTION_CODES. */
  s: SectionCode;
  /** Title, as shown. */
  t: string;
  /** One-line tagline. */
  d: string;
  /** Docs href. */
  h: string;
  /** Serial (KQ-001), when the item carries one. */
  n?: string;
  /** Resolved category label ("Inputs"), for scoping and display. */
  c?: string;
  /** Author-written keywords. */
  k?: string[];
  /** Prop names, matched on their own so a prop can be a landing target. */
  p?: string[];
  /** Everything else worth matching: description, prop docs, usage notes. */
  b?: string;
  /** Registry slug — the argument to the install command. */
  g?: string;
};

/** Human labels for each section, in the order results are grouped. */
export const SECTION_LABELS: Record<SearchSection, string> = {
  component: "Components",
  block: "Blocks",
  page: "Pages",
  template: "Templates",
  lab: "Playground",
  guide: "Guides",
  site: "Site",
};

export const SECTION_ORDER: SearchSection[] = [
  "component",
  "block",
  "page",
  "template",
  "lab",
  "guide",
  "site",
];
