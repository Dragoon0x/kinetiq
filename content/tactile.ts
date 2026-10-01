/**
 * Tactile's own taxonomy: the verb each component answers to and the shape
 * of the card it lives in on /tactile.
 *
 * Additive, like content/collections.ts — the manifest is never rewritten.
 * The map is pre-filled for the whole roster so a component slots into its
 * verb the moment it lands in the manifest. Hook-free and import-light so
 * server components and build scripts can both read it.
 */

import { categoryOf } from "./categories";

export type TactileVerb =
  | "hover"
  | "press"
  | "hold"
  | "drag"
  | "slide"
  | "swipe"
  | "type"
  | "select"
  | "draw"
  | "spin";

/** How much of the gallery grid a card takes: one cell, two across, two down. */
export type TactileAspect = "square" | "wide" | "tall" | "large";

export type Verb = {
  slug: TactileVerb;
  label: string;
  blurb: string;
};

/** The ordered verbs. Order drives the filter chips on /tactile. */
export const TACTILE_VERBS: Verb[] = [
  { slug: "hover", label: "Hover", blurb: "It answers before you touch it." },
  { slug: "press", label: "Press", blurb: "One press, felt all the way down." },
  { slug: "hold", label: "Hold", blurb: "Time under the finger is the input." },
  { slug: "drag", label: "Drag", blurb: "Picked up, carried, set down." },
  { slug: "slide", label: "Slide", blurb: "A value along a line." },
  { slug: "swipe", label: "Swipe", blurb: "A flick that means something." },
  { slug: "type", label: "Type", blurb: "Fields that keep up with you." },
  { slug: "select", label: "Select", blurb: "Picking, from one to many." },
  { slug: "draw", label: "Draw", blurb: "The stroke is the command." },
  { slug: "spin", label: "Spin", blurb: "Turned, wound, and let go." },
];

export const TACTILE_OF: Record<
  string,
  { verb: TactileVerb; aspect: TactileAspect }
> = {
  // hover
  "underline-peek": { verb: "hover", aspect: "wide" },
  "edge-peek": { verb: "hover", aspect: "wide" },
  "cross-grid": { verb: "hover", aspect: "wide" },
  "overflow-glide": { verb: "hover", aspect: "tall" },
  "try-on": { verb: "hover", aspect: "square" },
  eyedropper: { verb: "hover", aspect: "square" },
  // press
  "gel-switch": { verb: "press", aspect: "square" },
  "conjure-button": { verb: "press", aspect: "wide" },
  "split-confirm": { verb: "press", aspect: "wide" },
  "clicker-count": { verb: "press", aspect: "square" },
  "keycap-press": { verb: "press", aspect: "square" },
  "copy-slip": { verb: "press", aspect: "wide" },
  // hold
  "pour-hold": { verb: "hold", aspect: "tall" },
  "peek-hold": { verb: "hold", aspect: "tall" },
  "fuse-button": { verb: "hold", aspect: "wide" },
  "print-hold": { verb: "hold", aspect: "square" },
  "jiggle-mode": { verb: "hold", aspect: "square" },
  "drop-pin": { verb: "hold", aspect: "wide" },
  // drag
  "node-wire": { verb: "drag", aspect: "wide" },
  "fling-sort": { verb: "drag", aspect: "wide" },
  "sling-send": { verb: "drag", aspect: "tall" },
  "snap-guides": { verb: "drag", aspect: "wide" },
  "meld-tags": { verb: "drag", aspect: "wide" },
  "corner-pip": { verb: "drag", aspect: "wide" },
  // slide
  "level-vial": { verb: "slide", aspect: "wide" },
  "curve-slider": { verb: "slide", aspect: "square" },
  "ruler-tape": { verb: "slide", aspect: "wide" },
  "fader-sweep": { verb: "slide", aspect: "wide" },
  "stretch-slider": { verb: "slide", aspect: "wide" },
  "clip-trim": { verb: "slide", aspect: "wide" },
  // swipe
  "mood-swipe": { verb: "swipe", aspect: "square" },
  "day-strip": { verb: "swipe", aspect: "wide" },
  "slot-swipe": { verb: "swipe", aspect: "tall" },
  "story-cube": { verb: "swipe", aspect: "tall" },
  "filter-swipe": { verb: "swipe", aspect: "square" },
  "gesture-player": { verb: "swipe", aspect: "wide" },
  // type
  "hang-label": { verb: "type", aspect: "wide" },
  "roll-search": { verb: "type", aspect: "wide" },
  "sift-filter": { verb: "type", aspect: "tall" },
  "plain-date": { verb: "type", aspect: "wide" },
  "calc-field": { verb: "type", aspect: "wide" },
  "glide-caret": { verb: "type", aspect: "wide" },
  // select
  "ratio-morph": { verb: "select", aspect: "square" },
  "seat-map": { verb: "select", aspect: "wide" },
  "tool-dock": { verb: "select", aspect: "tall" },
  "lasso-grid": { verb: "select", aspect: "wide" },
  "brush-select": { verb: "select", aspect: "wide" },
  "zone-map": { verb: "select", aspect: "square" },
  // draw
  "pattern-lock": { verb: "draw", aspect: "square" },
  "stroke-command": { verb: "draw", aspect: "square" },
  "guess-line": { verb: "draw", aspect: "wide" },
  "loop-lift": { verb: "draw", aspect: "square" },
  "measure-line": { verb: "draw", aspect: "wide" },
  "scratch-card": { verb: "draw", aspect: "square" },
  // spin
  "jog-shuttle": { verb: "spin", aspect: "square" },
  "thumb-wheel": { verb: "spin", aspect: "tall" },
  "rotary-dial": { verb: "spin", aspect: "square" },
  "straighten-dial": { verb: "spin", aspect: "wide" },
  "vinyl-scrub": { verb: "spin", aspect: "square" },
  "angle-pick": { verb: "spin", aspect: "square" },
};

export const verbBySlug = (slug: string): Verb | undefined =>
  TACTILE_VERBS.find((v) => v.slug === slug);

/**
 * Build-time guard: every Tactile component must have a verb and a card
 * shape, so the gallery never drops one or guesses its size. Throws when a
 * tactile item is missing from TACTILE_OF.
 */
export function assertTactile(
  items: { name: string; categories?: string[] }[],
): void {
  const unmapped = items
    .filter((item) => categoryOf(item) === "tactile" && !TACTILE_OF[item.name])
    .map((item) => item.name);
  if (unmapped.length > 0) {
    throw new Error(
      `Tactile component(s) missing a verb in content/tactile.ts: ${unmapped.join(", ")}`,
    );
  }
}
