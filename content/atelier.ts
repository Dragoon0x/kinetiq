/**
 * Atelier's own taxonomy: the set each piece belongs to and the shape of the
 * card it lives in on /atelier.
 *
 * Additive, like content/tactile.ts — the manifest is never rewritten. The
 * map is pre-filled for the whole roster so a piece slots into its set the
 * moment it lands in the manifest. Hook-free and import-light so server
 * components and build scripts can both read it.
 */

import { categoryOf } from "./categories";
import type { TactileAspect } from "./tactile";

export type AtelierSet =
  | "notices"
  | "fields"
  | "menus"
  | "words"
  | "glyphs"
  | "pictures"
  | "widgets"
  | "keepsakes"
  | "frames"
  | "backdrops";

export type AtelierAspect = TactileAspect;

export type AtelierGroup = {
  slug: AtelierSet;
  label: string;
  blurb: string;
};

/** The ordered sets. Order drives the filter chips on /atelier. */
export const ATELIER_SETS: AtelierGroup[] = [
  {
    slug: "notices",
    label: "Notices",
    blurb: "News that arrives like a thing.",
  },
  {
    slug: "fields",
    label: "Fields",
    blurb: "Form controls, finished by hand.",
  },
  { slug: "menus", label: "Menus", blurb: "Ways in, and ways around." },
  { slug: "words", label: "Words", blurb: "Text still being written." },
  {
    slug: "glyphs",
    label: "Glyphs",
    blurb: "Small loaders that sit beside a label.",
  },
  {
    slug: "pictures",
    label: "Pictures",
    blurb: "Placeholders that become the picture.",
  },
  { slug: "widgets", label: "Widgets", blurb: "Glanceable, and alive." },
  {
    slug: "keepsakes",
    label: "Keepsakes",
    blurb: "Passes, cards and tickets worth keeping.",
  },
  { slug: "frames", label: "Frames", blurb: "Devices that hold your screen." },
  {
    slug: "backdrops",
    label: "Backdrops",
    blurb: "Surfaces for a hero to stand on.",
  },
];

export const ATELIER_OF: Record<
  string,
  { set: AtelierSet; aspect: AtelierAspect }
> = {
  // notices
  "paper-slip": { set: "notices", aspect: "tall" },
  "cork-notes": { set: "notices", aspect: "square" },
  "pneumatic-tube": { set: "notices", aspect: "tall" },
  beeper: { set: "notices", aspect: "wide" },
  "island-pill": { set: "notices", aspect: "wide" },
  "inbox-chute": { set: "notices", aspect: "tall" },
  "ribbon-unfurl": { set: "notices", aspect: "wide" },
  "edge-tab": { set: "notices", aspect: "tall" },
  "quick-reply": { set: "notices", aspect: "square" },
  "live-activity": { set: "notices", aspect: "wide" },
  // fields
  "tumbler-code": { set: "fields", aspect: "wide" },
  "vault-password": { set: "fields", aspect: "wide" },
  "globe-phone": { set: "fields", aspect: "wide" },
  "swatch-mixer": { set: "fields", aspect: "square" },
  "folder-drop": { set: "fields", aspect: "square" },
  "slug-field": { set: "fields", aspect: "wide" },
  "coin-amount": { set: "fields", aspect: "wide" },
  "catalog-select": { set: "fields", aspect: "square" },
  "ink-checklist": { set: "fields", aspect: "square" },
  "mail-field": { set: "fields", aspect: "wide" },
  // menus
  "ribbon-tabs": { set: "menus", aspect: "wide" },
  "cabinet-menu": { set: "menus", aspect: "tall" },
  "cantilever-menu": { set: "menus", aspect: "square" },
  "thumb-index": { set: "menus", aspect: "tall" },
  "key-ring": { set: "menus", aspect: "square" },
  "blind-menu": { set: "menus", aspect: "square" },
  "jukebox-menu": { set: "menus", aspect: "tall" },
  "view-morph": { set: "menus", aspect: "wide" },
  "pocket-nav": { set: "menus", aspect: "wide" },
  "liquid-tabbar": { set: "menus", aspect: "wide" },
  // words
  "ink-bleed": { set: "words", aspect: "wide" },
  "platen-print": { set: "words", aspect: "wide" },
  "neon-strike": { set: "words", aspect: "wide" },
  "crossword-guess": { set: "words", aspect: "wide" },
  "sand-script": { set: "words", aspect: "wide" },
  "redline-draft": { set: "words", aspect: "wide" },
  "morse-status": { set: "words", aspect: "wide" },
  "braille-rise": { set: "words", aspect: "wide" },
  "kiln-glow": { set: "words", aspect: "square" },
  "lens-sweep": { set: "words", aspect: "wide" },
  // glyphs
  "hourglass-turn": { set: "glyphs", aspect: "square" },
  "knot-tie": { set: "glyphs", aspect: "square" },
  "radio-tune": { set: "glyphs", aspect: "square" },
  "abacus-count": { set: "glyphs", aspect: "square" },
  "yarn-knit": { set: "glyphs", aspect: "square" },
  "geared-pen": { set: "glyphs", aspect: "square" },
  "kettle-steam": { set: "glyphs", aspect: "square" },
  "tape-reels": { set: "glyphs", aspect: "square" },
  "lava-drift": { set: "glyphs", aspect: "square" },
  "sundial-hour": { set: "glyphs", aspect: "square" },
  // pictures
  "darkroom-develop": { set: "pictures", aspect: "square" },
  "instant-shake": { set: "pictures", aspect: "tall" },
  "sketch-paint": { set: "pictures", aspect: "square" },
  "screen-print": { set: "pictures", aspect: "square" },
  "kaleido-resolve": { set: "pictures", aspect: "square" },
  "slide-projector": { set: "pictures", aspect: "wide" },
  "paint-numbers": { set: "pictures", aspect: "square" },
  "film-burn": { set: "pictures", aspect: "wide" },
  "jigsaw-set": { set: "pictures", aspect: "square" },
  "etch-reveal": { set: "pictures", aspect: "wide" },
  // widgets
  "sun-arc": { set: "widgets", aspect: "wide" },
  "moon-phase": { set: "widgets", aspect: "square" },
  "egg-timer": { set: "widgets", aspect: "square" },
  "plant-care": { set: "widgets", aspect: "square" },
  "bin-day": { set: "widgets", aspect: "square" },
  "commute-line": { set: "widgets", aspect: "wide" },
  "summit-steps": { set: "widgets", aspect: "square" },
  "dandelion-air": { set: "widgets", aspect: "square" },
  "wind-sock": { set: "widgets", aspect: "square" },
  "parking-meter": { set: "widgets", aspect: "square" },
  // keepsakes
  "tear-pass": { set: "keepsakes", aspect: "wide" },
  "mail-postcard": { set: "keepsakes", aspect: "wide" },
  "wax-seal": { set: "keepsakes", aspect: "square" },
  "library-card": { set: "keepsakes", aspect: "square" },
  "stat-card": { set: "keepsakes", aspect: "tall" },
  wristband: { set: "keepsakes", aspect: "wide" },
  "emboss-card": { set: "keepsakes", aspect: "wide" },
  "punch-card": { set: "keepsakes", aspect: "wide" },
  "award-seal": { set: "keepsakes", aspect: "wide" },
  "booth-strip": { set: "keepsakes", aspect: "tall" },
  // frames
  "pocket-phone": { set: "frames", aspect: "tall" },
  "lid-laptop": { set: "frames", aspect: "wide" },
  "slate-tablet": { set: "frames", aspect: "wide" },
  "crown-watch": { set: "frames", aspect: "square" },
  "tab-browser": { set: "frames", aspect: "wide" },
  "fold-phone": { set: "frames", aspect: "tall" },
  "pocket-console": { set: "frames", aspect: "tall" },
  viewfinder: { set: "frames", aspect: "wide" },
  "ink-reader": { set: "frames", aspect: "tall" },
  "stand-monitor": { set: "frames", aspect: "wide" },
  // backdrops
  "loom-field": { set: "backdrops", aspect: "wide" },
  "ink-marble": { set: "backdrops", aspect: "wide" },
  "koi-pond": { set: "backdrops", aspect: "wide" },
  "stained-glass": { set: "backdrops", aspect: "wide" },
  "paper-facets": { set: "backdrops", aspect: "wide" },
  "bokeh-night": { set: "backdrops", aspect: "wide" },
  "quilt-grid": { set: "backdrops", aspect: "wide" },
  "cloud-chamber": { set: "backdrops", aspect: "wide" },
  "ferro-pool": { set: "backdrops", aspect: "square" },
  "tartan-shift": { set: "backdrops", aspect: "wide" },
};

export const setBySlug = (slug: string): AtelierGroup | undefined =>
  ATELIER_SETS.find((s) => s.slug === slug);

/**
 * Build-time guard: every Atelier piece must have a set and a card shape, so
 * the gallery never drops one or guesses its size. Throws when an atelier
 * item is missing from ATELIER_OF.
 */
export function assertAtelier(
  items: { name: string; categories?: string[] }[],
): void {
  const unmapped = items
    .filter((item) => categoryOf(item) === "atelier" && !ATELIER_OF[item.name])
    .map((item) => item.name);
  if (unmapped.length > 0) {
    throw new Error(
      `Atelier piece(s) missing a set in content/atelier.ts: ${unmapped.join(", ")}`,
    );
  }
}
