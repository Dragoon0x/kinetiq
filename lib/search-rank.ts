/**
 * Ranking for the command deck.
 *
 * The library is one flat pile of ~750 records, so the question is never
 * "does this match" — half the catalog matches "motion" — but "which one did
 * they mean". Every field is scored on its own: a title someone typed in
 * full outranks a title that merely starts with it, which outranks a prop
 * name, which outranks a phrase buried in a description. A query with
 * several words has to satisfy all of them, each against whichever field
 * serves it best, so "button hold" finds the button that holds.
 *
 * Pure and dependency-free: the deck calls it on every keystroke over the
 * whole index.
 */
import type { SearchDoc, SearchSection } from "./search-doc";
import { SECTION_CODES, SECTION_ORDER } from "./search-doc";

/** Which field produced a hit — shown under the title, so a match is never a mystery. */
export type MatchField =
  "title" | "serial" | "keyword" | "prop" | "category" | "tagline" | "body";

export type SearchHit = {
  doc: SearchDoc;
  section: SearchSection;
  score: number;
  /** The strongest field that matched, and the exact text that matched in it. */
  reason: { field: MatchField; text: string } | null;
  /** [start, end) ranges into the title, for highlighting. */
  ranges: [number, number][];
};

const WEIGHT = {
  titleExact: 1000,
  serialExact: 980,
  titlePrefix: 700,
  titleWordPrefix: 600,
  keywordExact: 520,
  propExact: 500,
  categoryExact: 460,
  keywordPrefix: 420,
  propPrefix: 400,
  titleInfix: 360,
  taglineWordPrefix: 300,
  taglineInfix: 240,
  categoryInfix: 200,
  bodyWordPrefix: 140,
  bodyInfix: 100,
  titleFuzzy: 60,
} as const;

/** Sections rank against each other only to break ties. */
const SECTION_BONUS: Record<SearchSection, number> = {
  component: 6,
  block: 5,
  page: 4,
  template: 3,
  guide: 2,
  lab: 1,
  site: 0,
};

/** Serials are matched loosely: "KQ-001", "kq001" and "001" all mean KQ-001. */
const normalizeSerial = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True when `term` starts a word inside `text` (both already lowercase). */
function hasWordPrefix(text: string, term: string): boolean {
  let from = 0;
  for (;;) {
    const at = text.indexOf(term, from);
    if (at === -1) return false;
    if (at === 0 || !/[a-z0-9]/.test(text[at - 1] ?? "")) return true;
    from = at + 1;
  }
}

/**
 * Subsequence match, for the way people abbreviate: "prsbtn" reaching
 * "Pressure Button". Deliberately the weakest signal — on its own it will
 * match far too much, so it only ever decides between records that nothing
 * stronger separated.
 */
function isSubsequence(text: string, term: string): boolean {
  if (term.length < 3) return false;
  let index = 0;
  for (const char of text) {
    if (char === term[index]) index += 1;
    if (index === term.length) return true;
  }
  return false;
}

type FieldHit = { score: number; field: MatchField; text: string };

const NO_HIT: FieldHit = { score: 0, field: "body", text: "" };

/**
 * A record with its text pre-folded to lowercase. Doing this per keystroke
 * meant allocating a lowercase copy of every description on every term —
 * half a megabyte of garbage per letter typed. Prepared once per index and
 * cached, ranking the whole library costs well under a frame.
 */
type Prepared = {
  doc: SearchDoc;
  section: SearchSection;
  title: string;
  tagline: string;
  body: string;
  category: string;
  categoryRaw: string;
  serial: string;
  serialRaw: string;
  keywords: { raw: string; lower: string }[];
  props: { raw: string; lower: string }[];
};

const prepared = new WeakMap<readonly SearchDoc[], Prepared[]>();

function prepare(docs: readonly SearchDoc[]): Prepared[] {
  const cached = prepared.get(docs);
  if (cached) return cached;
  const fold = (value: string) => ({ raw: value, lower: value.toLowerCase() });
  const records = docs.map((doc) => ({
    doc,
    section: SECTION_CODES[doc.s],
    title: doc.t.toLowerCase(),
    tagline: doc.d.toLowerCase(),
    body: doc.b?.toLowerCase() ?? "",
    category: doc.c?.toLowerCase() ?? "",
    categoryRaw: doc.c ?? "",
    serial: doc.n ? normalizeSerial(doc.n) : "",
    serialRaw: doc.n ?? "",
    keywords: (doc.k ?? []).map(fold),
    props: (doc.p ?? []).map(fold),
  }));
  prepared.set(docs, records);
  return records;
}

/** Best score for one term against one record, and where it came from. */
function scoreTerm(record: Prepared, term: string): FieldHit {
  const { doc, title } = record;

  if (title === term)
    return { score: WEIGHT.titleExact, field: "title", text: doc.t };

  if (record.serial) {
    const serial = record.serial;
    const wanted = normalizeSerial(term);
    // The bare number matches too, but only once it is long enough to mean
    // something — "01" would otherwise pull in a hundred serials.
    const numeric = wanted.length >= 3 && /^\d+$/.test(wanted);
    if (serial === wanted || (numeric && serial.endsWith(wanted))) {
      return {
        score: WEIGHT.serialExact,
        field: "serial",
        text: record.serialRaw,
      };
    }
  }

  if (title.startsWith(term)) {
    return { score: WEIGHT.titlePrefix, field: "title", text: doc.t };
  }
  if (hasWordPrefix(title, term)) {
    return { score: WEIGHT.titleWordPrefix, field: "title", text: doc.t };
  }

  let best = NO_HIT;
  const keep = (hit: FieldHit) => {
    if (hit.score > best.score) best = hit;
  };

  for (const keyword of record.keywords) {
    if (keyword.lower === term)
      keep({ score: WEIGHT.keywordExact, field: "keyword", text: keyword.raw });
    else if (hasWordPrefix(keyword.lower, term))
      keep({
        score: WEIGHT.keywordPrefix,
        field: "keyword",
        text: keyword.raw,
      });
  }

  for (const prop of record.props) {
    if (prop.lower === term)
      keep({ score: WEIGHT.propExact, field: "prop", text: prop.raw });
    else if (prop.lower.startsWith(term))
      keep({ score: WEIGHT.propPrefix, field: "prop", text: prop.raw });
  }

  if (record.category) {
    const category = record.category;
    if (category === term)
      keep({
        score: WEIGHT.categoryExact,
        field: "category",
        text: record.categoryRaw,
      });
    else if (category.includes(term))
      keep({
        score: WEIGHT.categoryInfix,
        field: "category",
        text: record.categoryRaw,
      });
  }

  if (title.includes(term))
    keep({ score: WEIGHT.titleInfix, field: "title", text: doc.t });

  const tagline = record.tagline;
  if (hasWordPrefix(tagline, term))
    keep({ score: WEIGHT.taglineWordPrefix, field: "tagline", text: doc.d });
  else if (tagline.includes(term))
    keep({ score: WEIGHT.taglineInfix, field: "tagline", text: doc.d });

  if (record.body) {
    const body = record.body;
    if (hasWordPrefix(body, term))
      keep({
        score: WEIGHT.bodyWordPrefix,
        field: "body",
        text: excerpt(doc.b ?? "", term),
      });
    else if (body.includes(term))
      keep({
        score: WEIGHT.bodyInfix,
        field: "body",
        text: excerpt(doc.b ?? "", term),
      });
  }

  if (best.score === 0 && isSubsequence(title, term)) {
    keep({ score: WEIGHT.titleFuzzy, field: "title", text: doc.t });
  }

  return best;
}

/** A few words either side of the match, so a body hit shows its context. */
function excerpt(body: string, term: string): string {
  const at = body.toLowerCase().indexOf(term);
  if (at === -1) return body.slice(0, 80);
  const start = Math.max(0, body.lastIndexOf(" ", Math.max(0, at - 28)) + 1);
  const end = body.indexOf(" ", at + term.length + 28);
  const text = body.slice(start, end === -1 ? body.length : end);
  return `${start > 0 ? "…" : ""}${text}${end === -1 ? "" : "…"}`;
}

/** Every place a term appears in the title, merged, for highlighting. */
function titleRanges(title: string, terms: string[]): [number, number][] {
  const lower = title.toLowerCase();
  const found: [number, number][] = [];
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(term, from);
      if (at === -1) break;
      found.push([at, at + term.length]);
      from = at + term.length;
    }
  }
  if (found.length === 0) return found;
  found.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [found[0]!];
  for (const range of found.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range);
  }
  return merged;
}

const REASON_RANK: Record<MatchField, number> = {
  serial: 6,
  prop: 5,
  keyword: 4,
  category: 3,
  title: 2,
  tagline: 1,
  body: 0,
};

export type RankOptions = {
  /** Restrict to one section; undefined searches everything. */
  section?: SearchSection;
  /** How many hits to return. */
  limit?: number;
};

/**
 * Scores the index against a query, best first. An empty query returns
 * nothing — the deck shows recents and a starting point instead.
 */
export function rankDocs(
  docs: readonly SearchDoc[],
  query: string,
  options: RankOptions = {},
): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const limit = options.limit ?? 40;

  const hits: SearchHit[] = [];
  for (const record of prepare(docs)) {
    const { doc, section } = record;
    if (options.section && section !== options.section) continue;

    let total = 0;
    let reason: FieldHit | null = null;
    let matchedAll = true;

    for (const term of terms) {
      const hit = scoreTerm(record, term);
      if (hit.score === 0) {
        matchedAll = false;
        break;
      }
      total += hit.score;
      // Report the most specific field that matched, not merely the
      // highest-scoring one: "it matched a prop" is the useful sentence.
      if (
        !reason ||
        REASON_RANK[hit.field] > REASON_RANK[reason.field] ||
        (REASON_RANK[hit.field] === REASON_RANK[reason.field] &&
          hit.score > reason.score)
      ) {
        reason = hit;
      }
    }
    if (!matchedAll || !reason) continue;

    // Ties go to the shorter title (more specific) and then to the section
    // a reader is likeliest to have meant.
    total += SECTION_BONUS[section];
    total += Math.max(0, 40 - doc.t.length) / 40;

    hits.push({
      doc,
      section,
      score: total,
      reason: { field: reason.field, text: reason.text },
      ranges: titleRanges(doc.t, terms),
    });
  }

  hits.sort(
    (a, b) =>
      b.score - a.score ||
      SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) ||
      a.doc.t.localeCompare(b.doc.t),
  );
  return hits.slice(0, limit);
}
