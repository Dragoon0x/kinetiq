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
  // animations
  "glass-orb": { set: "animations", aspect: "square" },
  "live-wire-mark": { set: "animations", aspect: "wide" },
  "dither-curtain": { set: "animations", aspect: "wide" },
  "lantern-cursor": { set: "animations", aspect: "wide" },
  "scroll-unfold": { set: "animations", aspect: "large" },
  "drop-ripple": { set: "animations", aspect: "wide" },
  "cloth-grid": { set: "animations", aspect: "wide" },
  murmuration: { set: "animations", aspect: "wide" },
  "halftone-wake": { set: "animations", aspect: "wide" },
  "mosaic-flip": { set: "animations", aspect: "wide" },
  "dot-lens": { set: "animations", aspect: "wide" },
  "enter-stage": { set: "animations", aspect: "wide" },
  "haze-fade": { set: "animations", aspect: "wide" },
  "arc-border": { set: "animations", aspect: "wide" },
  "moon-ring": { set: "animations", aspect: "wide" },
  "block-dissolve": { set: "animations", aspect: "square" },
  "sheen-glass": { set: "animations", aspect: "square" },
  "float-field": { set: "animations", aspect: "wide" },
  "logo-parade": { set: "animations", aspect: "wide" },
  "lock-on": { set: "animations", aspect: "wide" },
  "halo-rings": { set: "animations", aspect: "wide" },
  "laser-sheet": { set: "animations", aspect: "wide" },
  "compass-field": { set: "animations", aspect: "wide" },
  "phantom-cursor": { set: "animations", aspect: "wide" },
  "edge-haze": { set: "animations", aspect: "tall" },
  "click-bloom": { set: "animations", aspect: "square" },
  lodestone: { set: "animations", aspect: "square" },
  "kelp-strands": { set: "animations", aspect: "wide" },
  "peel-label": { set: "animations", aspect: "square" },
  "mosaic-trail": { set: "animations", aspect: "wide" },
  "cube-field": { set: "animations", aspect: "wide" },
  "molten-mark": { set: "animations", aspect: "wide" },
  "film-grain": { set: "animations", aspect: "wide" },
  "soft-shape": { set: "animations", aspect: "wide" },
  "sight-lines": { set: "animations", aspect: "wide" },
  "photo-scatter": { set: "animations", aspect: "wide" },
  "silk-ribbons": { set: "animations", aspect: "wide" },
  "ink-splash": { set: "animations", aspect: "wide" },
  "lava-blobs": { set: "animations", aspect: "tall" },
  "jelly-cursor": { set: "animations", aspect: "wide" },
  "comet-border": { set: "animations", aspect: "wide" },
  // backgrounds
  "chevron-tide": { set: "backgrounds", aspect: "wide" },
  "louver-light": { set: "backgrounds", aspect: "wide" },
  "shape-swell": { set: "backgrounds", aspect: "wide" },
  "glass-drift": { set: "backgrounds", aspect: "wide" },
  "fiber-mist": { set: "backgrounds", aspect: "wide" },
  "tube-glow": { set: "backgrounds", aspect: "wide" },
  "forge-flow": { set: "backgrounds", aspect: "wide" },
  "dune-gradient": { set: "backgrounds", aspect: "wide" },
  "dew-web": { set: "backgrounds", aspect: "wide" },
  "survey-contours": { set: "backgrounds", aspect: "wide" },
  "light-corridor": { set: "backgrounds", aspect: "wide" },
  "sliced-horizon": { set: "backgrounds", aspect: "wide" },
  "pulse-tiles": { set: "backgrounds", aspect: "wide" },
  "scan-bed": { set: "backgrounds", aspect: "wide" },
  "iron-sand": { set: "backgrounds", aspect: "wide" },
  "glow-rain": { set: "backgrounds", aspect: "wide" },
  "aether-swirl": { set: "backgrounds", aspect: "wide" },
  "prism-spill": { set: "backgrounds", aspect: "wide" },
  "night-veil": { set: "backgrounds", aspect: "wide" },
  "beacon-pillar": { set: "backgrounds", aspect: "wide" },
  "drape-silk": { set: "backgrounds", aspect: "wide" },
  "drift-lines": { set: "backgrounds", aspect: "wide" },
  "window-shafts": { set: "backgrounds", aspect: "wide" },
  "crown-rays": { set: "backgrounds", aspect: "wide" },
  "pixel-bloom": { set: "backgrounds", aspect: "wide" },
  "color-fold": { set: "backgrounds", aspect: "wide" },
  "iris-watch": { set: "backgrounds", aspect: "wide" },
  "harp-strings": { set: "backgrounds", aspect: "wide" },
  "sweep-scope": { set: "backgrounds", aspect: "wide" },
  "polar-glow": { set: "backgrounds", aspect: "wide" },
  "aurora-curtain": { set: "backgrounds", aspect: "wide" },
  "plasma-bloom": { set: "backgrounds", aspect: "wide" },
  "plasma-ribbon": { set: "backgrounds", aspect: "wide" },
  "dust-motes": { set: "backgrounds", aspect: "wide" },
  "shutter-glow": { set: "backgrounds", aspect: "wide" },
  "grain-mesh": { set: "backgrounds", aspect: "wide" },
  "horizon-grid": { set: "backgrounds", aspect: "wide" },
  "stage-beams": { set: "backgrounds", aspect: "wide" },
  "pixel-snowfall": { set: "backgrounds", aspect: "wide" },
  "storm-front": { set: "backgrounds", aspect: "wide" },
  "spectrum-burst": { set: "backgrounds", aspect: "wide" },
  "star-spiral": { set: "backgrounds", aspect: "wide" },
  "dither-dunes": { set: "backgrounds", aspect: "wide" },
  "relay-terminal": { set: "backgrounds", aspect: "wide" },
  "ripple-lattice": { set: "backgrounds", aspect: "wide" },
  "pollen-flow": { set: "backgrounds", aspect: "wide" },
  "dot-tide": { set: "backgrounds", aspect: "wide" },
  "thread-drift": { set: "backgrounds", aspect: "wide" },
  "night-drive": { set: "backgrounds", aspect: "wide" },
  "oil-film": { set: "backgrounds", aspect: "wide" },
  "tide-lines": { set: "backgrounds", aspect: "wide" },
  "bend-grid": { set: "backgrounds", aspect: "wide" },
  "bead-pit": { set: "backgrounds", aspect: "wide" },
  "glow-orb": { set: "backgrounds", aspect: "wide" },
  "letter-field": { set: "backgrounds", aspect: "wide" },
  "tile-drift": { set: "backgrounds", aspect: "wide" },
  "shape-lattice": { set: "backgrounds", aspect: "wide" },
  "chrome-pool": { set: "backgrounds", aspect: "wide" },
  "paint-vortex": { set: "backgrounds", aspect: "wide" },
  // micro
  "strip-shred": { set: "micro", aspect: "square" },
  "paper-ball": { set: "micro", aspect: "square" },
  "stub-tear": { set: "micro", aspect: "wide" },
  "turnover-card": { set: "micro", aspect: "square" },
  "branch-out": { set: "micro", aspect: "square" },
  "folder-fan": { set: "micro", aspect: "square" },
  "crop-marks": { set: "micro", aspect: "wide" },
  "think-thread": { set: "micro", aspect: "wide" },
  "talk-pill": { set: "micro", aspect: "wide" },
  "tank-level": { set: "micro", aspect: "square" },
  "ask-bar": { set: "micro", aspect: "wide" },
  "flick-note": { set: "micro", aspect: "wide" },
  slingshot: { set: "micro", aspect: "square" },
  "chime-bell": { set: "micro", aspect: "square" },
  "line-chip": { set: "micro", aspect: "wide" },
  "verdict-mark": { set: "micro", aspect: "square" },
  "rail-select": { set: "micro", aspect: "square" },
  "ledger-swipe": { set: "micro", aspect: "wide" },
  "goo-radio": { set: "micro", aspect: "wide" },
  "comet-knob": { set: "micro", aspect: "square" },
  "wake-range": { set: "micro", aspect: "wide" },
  "pin-slots": { set: "micro", aspect: "wide" },
  "shy-label": { set: "micro", aspect: "wide" },
  "lattice-wait": { set: "micro", aspect: "square" },
  "drag-number": { set: "micro", aspect: "square" },
  "fuse-confirm": { set: "micro", aspect: "wide" },
  "ember-tip": { set: "micro", aspect: "wide" },
  "slide-seal": { set: "micro", aspect: "wide" },
  "stretch-tabs": { set: "micro", aspect: "wide" },
  "beat-like": { set: "micro", aspect: "square" },
  "tick-spring": { set: "micro", aspect: "square" },
  "star-peek": { set: "micro", aspect: "wide" },
  "heat-hold": { set: "micro", aspect: "wide" },
  "squash-switch": { set: "micro", aspect: "square" },
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
