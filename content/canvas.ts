/**
 * Canvas's own taxonomy: the set each piece belongs to and the shape of the
 * card it lives in on /canvas.
 *
 * Additive, like content/studio.ts — the manifest is never rewritten. The map
 * is pre-filled for the roster so a piece slots into its set the moment it
 * lands in the manifest. Hook-free and import-light so server components and
 * build scripts can both read it.
 */

import { categoryOf } from "./categories";
import type { TactileAspect } from "./tactile";

export type CanvasSet =
  | "components"
  | "blocks"
  | "app-ui"
  | "templates"
  | "text"
  | "micro"
  | "backgrounds"
  | "animations";

export type CanvasAspect = TactileAspect;

export type CanvasGroup = {
  slug: CanvasSet;
  label: string;
  blurb: string;
};

/**
 * The ordered sets. Order drives the filter chips on /canvas; a set shows
 * there only once it holds a piece.
 */
export const CANVAS_SETS: CanvasGroup[] = [
  {
    slug: "components",
    label: "Components",
    blurb: "Effects, galleries and objects to build with.",
  },
  { slug: "blocks", label: "Blocks", blurb: "Whole sections of a page." },
  { slug: "app-ui", label: "App UI", blurb: "The working parts of a product." },
  {
    slug: "templates",
    label: "Templates",
    blurb: "Complete sites to start from.",
  },
  {
    slug: "text",
    label: "Text",
    blurb: "Type that arrives, reacts and settles.",
  },
  { slug: "micro", label: "Micro", blurb: "Small controls with a big feel." },
  {
    slug: "backgrounds",
    label: "Backgrounds",
    blurb: "Living surfaces behind your words.",
  },
  {
    slug: "animations",
    label: "Animations",
    blurb: "Cursors, reveals and hovers with intent.",
  },
];

/**
 * Every Canvas piece: its set, and its card on the wall — square, wide, tall,
 * or large (two columns by two rows).
 */
export const CANVAS_OF: Record<
  string,
  { set: CanvasSet; aspect: CanvasAspect }
> = {
  // text
  "tune-in": { set: "text", aspect: "wide" },
  "drum-words": { set: "text", aspect: "wide" },
  "tide-mask": { set: "text", aspect: "wide" },
  "grain-gather": { set: "text", aspect: "wide" },
  "depot-board": { set: "text", aspect: "wide" },
  "lens-warp": { set: "text", aspect: "wide" },
  "pen-outline": { set: "text", aspect: "wide" },
  "stack-extrude": { set: "text", aspect: "wide" },
  "paper-crease": { set: "text", aspect: "wide" },
  "after-image": { set: "text", aspect: "wide" },
  "cascade-split": { set: "text", aspect: "wide" },
  "depth-of-field": { set: "text", aspect: "wide" },
  "orbit-script": { set: "text", aspect: "square" },
  "caption-live": { set: "text", aspect: "wide" },
  "deck-shuffle": { set: "text", aspect: "wide" },
  "foil-sheen": { set: "text", aspect: "wide" },
  "weight-field": { set: "text", aspect: "wide" },
  "contour-marquee": { set: "text", aspect: "wide" },
  "static-fuzz": { set: "text", aspect: "wide" },
  "pigment-flow": { set: "text", aspect: "wide" },
  "letter-rain": { set: "text", aspect: "wide" },
  "type-trail": { set: "text", aspect: "wide" },
  "cipher-wheel": { set: "text", aspect: "wide" },
  "word-bracket": { set: "text", aspect: "wide" },
  "buoyant-line": { set: "text", aspect: "wide" },
  "read-along": { set: "text", aspect: "wide" },
  "char-cast": { set: "text", aspect: "wide" },
  "scramble-brush": { set: "text", aspect: "wide" },
  "stamp-cycle": { set: "text", aspect: "wide" },
  "datamosh-type": { set: "text", aspect: "wide" },
  "speed-banner": { set: "text", aspect: "wide" },
  "breath-type": { set: "text", aspect: "wide" },
  "tally-roll": { set: "text", aspect: "square" },
};

export const setBySlug = (slug: string): CanvasGroup | undefined =>
  CANVAS_SETS.find((s) => s.slug === slug);

/** The sets that hold at least one of these pieces, in chip order. */
export function liveCanvasSets(items: { name: string }[]): CanvasGroup[] {
  const present = new Set(
    items.map((item) => CANVAS_OF[item.name]?.set).filter(Boolean),
  );
  return CANVAS_SETS.filter((s) => present.has(s.slug));
}

/** Fails loudly when a Canvas piece lands in the manifest without a set. */
export function assertCanvas(
  items: { name: string; categories?: string[] }[],
): void {
  const unmapped = items
    .filter((item) => categoryOf(item) === "canvas" && !CANVAS_OF[item.name])
    .map((item) => item.name);
  if (unmapped.length > 0) {
    throw new Error(
      `Canvas piece(s) missing a set in content/canvas.ts: ${unmapped.join(", ")}`,
    );
  }
}
