/**
 * The showcase layer: one bespoke destination per non-spatial category.
 *
 * Every category already has an index (/components/category/<slug>); a showcase
 * is the room you walk into — a hero that is the category demonstrating itself,
 * a few signature instruments, then the full set. Spatial is excluded: the wing
 * has its own gallery at /spatial.
 *
 * This is an ADDITIVE layer, exactly like content/categories.ts and
 * content/collections.ts — the manifest is never rewritten. Hook-free and
 * import-light so tsx build scripts and server components can both consume it.
 */

import { CATEGORIES, categoryOf, type CategorySlug } from "./categories";

/**
 * How a showcase's hero renders its live component.
 * - `stage`    the instrument sits in a framed stage under the copy, fully interactive.
 * - `backdrop` an ambient field paints behind the copy (decorative, inert).
 * - `headline` the instrument IS the visual headline; the copy stays as an sr-only h1.
 */
export type HeroMode = "stage" | "backdrop" | "headline";

export type Showcase = {
  slug: CategorySlug;
  /** The room's statement. In `headline` mode this becomes the sr-only h1. */
  headline: string;
  /** One line under the headline. */
  deck: string;
  /** The category demonstrating itself — one live instrument. */
  hero: { slug: string; mode: HeroMode };
  /**
   * Up to four signature instruments, mounted on intent. Never the hero. May be
   * empty while a category is still thin — the section is omitted rather than
   * rendered hollow.
   */
  leads: string[];
  /** The closing line. Carries no counts — the catalog grows. */
  closing: string;
};

/** Spatial keeps /spatial; every other category gets a showcase. */
export const SHOWCASE_SLUGS: CategorySlug[] = CATEGORIES.map((c) => c.slug).filter(
  (slug) => slug !== "spatial",
);

/** Ordered to match CATEGORIES. */
export const SHOWCASES: Showcase[] = [
  {
    slug: "inputs",
    headline: "Every control answers the press.",
    deck: "Fields, buttons, and switches calibrated so the feedback lands before you let go.",
    hero: { slug: "caliper-slider", mode: "stage" },
    leads: ["range-dual", "stepper-number", "tag-field", "trace-input"],
    closing: "One calibration set, wired in one command.",
  },
  {
    slug: "selection",
    headline: "Pick with conviction.",
    deck: "Segments, chips, and choosers that commit — the decision reads in the throw.",
    hero: { slug: "segmented-control", mode: "stage" },
    leads: ["chip-cloud", "rating-arc", "swatch-lock", "listbox-roster"],
    closing: "Choosing should feel decided, not guessed.",
  },
  {
    slug: "navigation",
    headline: "Move without losing the thread.",
    deck: "Tabs, rails, docks, and dials that project your throw to the nearest detent.",
    hero: { slug: "orbit-menu", mode: "stage" },
    leads: ["stepper-flow", "pagination-rail", "breadcrumb-trail", "gantry-tabs"],
    closing: "Every route lands where you aimed it.",
  },
  {
    slug: "overlays",
    headline: "Arrive with intent. Leave without a trace.",
    deck: "Dialogs, sheets, and callouts that come from somewhere and go back to it.",
    hero: { slug: "morph-dialog", mode: "stage" },
    leads: ["popover-menu", "context-menu", "hover-card", "spotlight-tour"],
    closing: "A layer should explain where it came from.",
  },
  {
    slug: "data",
    headline: "Numbers that draw themselves.",
    deck: "Readouts, charts, rings, and flows that resolve into meaning as they settle.",
    hero: { slug: "bar-race", mode: "stage" },
    leads: ["donut-breakdown", "gauge-cluster", "heat-calendar", "spark-chart"],
    closing: "Legibility first; the motion only carries it.",
  },
  {
    slug: "feedback",
    headline: "Status you feel before you read it.",
    deck: "Toasts, loaders, and seals that confirm the thing that just happened.",
    hero: { slug: "metronome-loader", mode: "stage" },
    leads: ["stage-progress", "skeleton-weave", "alert-bar", "retry-pulse"],
    closing: "Confirmation is a physical event.",
  },
  {
    slug: "layout",
    headline: "Structure that rearranges itself.",
    deck: "Disclosure, grids, and shells that reflow on the glide instead of jumping.",
    hero: { slug: "masonry-flow", mode: "stage" },
    leads: ["split-pane", "expander-tree", "sticky-stack", "tile-grid"],
    closing: "Nothing teleports; everything travels.",
  },
  {
    slug: "motion",
    headline: "Motion as the material.",
    deck: "Tickers, reveals, and timelines tied to scroll and to time itself.",
    hero: { slug: "ticker-tape", mode: "stage" },
    leads: ["marquee-swap", "reveal-stagger", "progress-scrub", "sticky-reveal"],
    closing: "Time is a control surface.",
  },
  {
    slug: "text",
    headline: "Typography that performs.",
    deck: "Words that decode, sharpen, and settle one character at a time.",
    hero: { slug: "gradient-title", mode: "headline" },
    leads: ["focus-text", "cipher-text", "type-on", "redact-reveal"],
    closing: "Type is the instrument, not the label.",
  },
  {
    slug: "backgrounds",
    headline: "Living surfaces.",
    deck: "Fields, lattices, and ribbons that answer the cursor and idle when ignored.",
    hero: { slug: "wavefield", mode: "backdrop" },
    leads: ["particle-network", "flow-field", "gradient-drift", "aurora-ribbon"],
    closing: "Ambient, never expensive.",
  },
  {
    slug: "cursor",
    headline: "The pointer as an instrument.",
    deck: "Trails, magnets, and spotlights that track your hand across the surface.",
    hero: { slug: "magnetic-cursor", mode: "stage" },
    leads: ["cursor-lens", "cursor-label", "trail-ink", "comet-cursor"],
    closing: "The cursor is the one control everyone already holds.",
  },
  {
    slug: "physics",
    headline: "Mass, spring, and momentum.",
    deck: "Sheets, ropes, and decks with real weight — throw them and they answer.",
    hero: { slug: "newton-cradle", mode: "stage" },
    leads: ["gooey-blob", "plinko-drop", "pendulum-wave", "tether-rope"],
    closing: "Weight is what makes it feel true.",
  },
  {
    slug: "delight",
    headline: "Small celebrations, calibrated.",
    deck: "Taps, bursts, and reactions tuned to the millisecond — restraint is the point.",
    hero: { slug: "confetti-pop", mode: "stage" },
    leads: ["boop-mascot", "sticker-peel", "sound-toggle", "heart-tap"],
    closing: "Delight rations itself.",
  },
];

export const showcaseBySlug = (slug: string): Showcase | undefined =>
  SHOWCASES.find((s) => s.slug === slug);

/**
 * Build-time guard, in the spirit of `assertSpatialCollections`: a showcase that
 * points at an instrument which has moved category (or been renamed) would
 * render an empty hero, so fail the build loudly instead.
 */
export function assertShowcases(
  items: { name: string; categories?: string[] }[],
): void {
  const problems: string[] = [];
  const byName = new Map(items.map((item) => [item.name, item] as const));

  const covered = new Set(SHOWCASES.map((s) => s.slug));
  for (const slug of SHOWCASE_SLUGS) {
    if (!covered.has(slug)) problems.push(`no showcase for category "${slug}"`);
  }
  if (SHOWCASES.some((s) => s.slug === "spatial")) {
    problems.push('spatial must not have a showcase — it has /spatial');
  }

  for (const showcase of SHOWCASES) {
    const belongs = (slug: string, role: string) => {
      const item = byName.get(slug);
      if (!item) {
        problems.push(`${showcase.slug}: ${role} "${slug}" is not a component`);
        return;
      }
      if (categoryOf(item) !== showcase.slug) {
        problems.push(
          `${showcase.slug}: ${role} "${slug}" resolves to "${categoryOf(item)}"`,
        );
      }
    };

    belongs(showcase.hero.slug, "hero");
    if (showcase.leads.length > 4) {
      problems.push(
        `${showcase.slug}: expected at most 4 leads, found ${showcase.leads.length}`,
      );
    }
    if (new Set(showcase.leads).size !== showcase.leads.length) {
      problems.push(`${showcase.slug}: duplicate leads`);
    }
    for (const lead of showcase.leads) {
      belongs(lead, "lead");
      if (lead === showcase.hero.slug) {
        problems.push(`${showcase.slug}: lead "${lead}" is already the hero`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `content/showcases.ts is out of sync with the manifest:\n  - ${problems.join("\n  - ")}`,
    );
  }
}
