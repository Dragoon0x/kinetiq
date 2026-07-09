/**
 * The Spatial Wing's sub-taxonomy: ten ordered collections that group the
 * spatial category's instruments in the docs nav, the category landing page,
 * the explorer's sub-filters, and the /spatial gallery.
 *
 * This is an ADDITIVE layer, exactly like content/categories.ts — the manifest
 * is never rewritten. Membership lives here in one explicit map, pre-filled
 * for the whole v4 roster so instruments slot into their collection the moment
 * they land in the manifest. Hook-free and import-light so tsx build scripts
 * and server components can both consume it.
 */

import { categoryOf } from "./categories";

export type CollectionSlug =
  | "depth"
  | "objects"
  | "cameras"
  | "surfaces"
  | "typography"
  | "wayfinding"
  | "scenes"
  | "volumetrics"
  | "projection"
  | "mechanisms";

export type Collection = {
  slug: CollectionSlug;
  label: string;
  blurb: string;
};

/** The ordered wing. Order drives the sidebar, the category page, and /spatial. */
export const SPATIAL_COLLECTIONS: Collection[] = [
  {
    slug: "depth",
    label: "Depth & Parallax",
    blurb:
      "Layers that separate, recede, and reveal — the z-axis as a browsing surface.",
  },
  {
    slug: "objects",
    label: "Objects",
    blurb:
      "Cubes, coins, drums, and dials — true geometry you can grab, spin, and settle.",
  },
  {
    slug: "cameras",
    label: "Cameras",
    blurb:
      "The point of view as the instrument — dollies, orbits, tunnels, and rails.",
  },
  {
    slug: "surfaces",
    label: "Surfaces & Materials",
    blurb:
      "Glass, foil, cloth, and fold — materials whose behavior carries the meaning.",
  },
  {
    slug: "typography",
    label: "Spatial Text",
    blurb:
      "Type with a z-coordinate — headlines that recede, converge, and cast secrets.",
  },
  {
    slug: "wayfinding",
    label: "Spatial Navigation",
    blurb:
      "Menus, decks, and steppers that use distance the way flat UI uses order.",
  },
  {
    slug: "scenes",
    label: "Scenes & Dioramas",
    blurb:
      "Small worlds under glass — stages, shelves, and towns that answer your hand.",
  },
  {
    slug: "volumetrics",
    label: "Volumetrics",
    blurb:
      "Particles with depth — starfields, fog, embers, and wells drawn on canvas.",
  },
  {
    slug: "projection",
    label: "Projection & Maps",
    blurb:
      "Terrain, globes, sections, and scopes — data projected into space.",
  },
  {
    slug: "mechanisms",
    label: "Mechanisms",
    blurb:
      "Hinges, gears, cranks, and levers — interface actions with working machinery.",
  },
];

const COLLECTION_BY_SLUG = new Map<string, Collection>(
  SPATIAL_COLLECTIONS.map((c) => [c.slug, c]),
);

/**
 * Every spatial instrument → its collection. The v4 roster (KQ-061..160) is
 * fixed up front; entries whose instruments haven't landed yet are inert.
 */
export const COLLECTION_OF: Record<string, CollectionSlug> = {
  // Shipped before the wing opened.
  "gyro-card": "surfaces",
  "status-seal": "mechanisms",
  zoetrope: "mechanisms",
  coverflow: "wayfinding",
  "parallax-scene": "scenes",
  "point-globe": "projection",

  // A · Depth & Parallax (KQ-061..070)
  "depth-stack": "depth",
  "peek-portal": "depth",
  "strata-scroll": "depth",
  "hover-relief": "depth",
  "focus-rack": "depth",
  "layer-peel": "depth",
  "slice-compare": "depth",
  "depth-lens": "depth",
  "altitude-list": "depth",
  "horizon-rise": "depth",

  // B · Objects (KQ-071..080)
  "facet-cube": "objects",
  "prism-flip": "objects",
  "coin-toggle": "objects",
  "dice-roll": "objects",
  "gimbal-dial": "objects",
  "rolodex-list": "objects",
  "wheel-picker": "objects",
  "flip-mosaic": "objects",
  orrery: "objects",
  "balance-mobile": "objects",

  // C · Cameras (KQ-081..090)
  "dolly-frame": "cameras",
  "orbit-stage": "cameras",
  "tunnel-dive": "cameras",
  "pan-window": "cameras",
  "zoom-atlas": "cameras",
  "crane-scroll": "cameras",
  "look-room": "cameras",
  "camera-rail": "cameras",
  "pivot-grid": "cameras",
  "elevator-nav": "cameras",

  // D · Surfaces & Materials (KQ-091..100)
  "glass-pane": "surfaces",
  "foil-card": "surfaces",
  "slat-wall": "surfaces",
  "fold-out": "surfaces",
  "height-field": "surfaces",
  "curtain-lift": "surfaces",
  "mirror-hall": "surfaces",
  "frost-wipe": "surfaces",
  "crumple-sheet": "surfaces",
  "lenticular-card": "surfaces",

  // E · Spatial Text (KQ-101..110)
  "vanish-type": "typography",
  "extrude-title": "typography",
  "orbit-tags": "typography",
  "path-type": "typography",
  "billboard-run": "typography",
  "turn-word": "typography",
  "converge-quote": "typography",
  "shadow-script": "typography",
  "punch-type": "typography",
  "helix-index": "typography",

  // F · Spatial Navigation (KQ-111..120)
  "ring-dial": "wayfinding",
  "z-accordion": "wayfinding",
  "depth-menu": "wayfinding",
  "stage-tabs": "wayfinding",
  "card-fan": "wayfinding",
  "hallway-menu": "wayfinding",
  "deck-switcher": "wayfinding",
  "flyover-map": "wayfinding",
  "gate-stepper": "wayfinding",
  "hinge-nav": "wayfinding",

  // G · Scenes & Dioramas (KQ-121..130)
  "pop-book": "scenes",
  "iso-blocks": "scenes",
  "lift-tray": "scenes",
  "shaker-dome": "scenes",
  "daylight-dial": "scenes",
  "cutout-town": "scenes",
  "transit-window": "scenes",
  "spotlight-stage": "scenes",
  "pull-shelf": "scenes",
  "turn-model": "scenes",

  // H · Volumetrics (KQ-131..140)
  "star-warp": "volumetrics",
  "depth-fog": "volumetrics",
  "ember-column": "volumetrics",
  "constellation-map": "volumetrics",
  "rain-pane": "volumetrics",
  "sun-shaft": "volumetrics",
  "firefly-field": "volumetrics",
  "vapor-ring": "volumetrics",
  "gravity-well": "volumetrics",
  "paper-flight": "volumetrics",

  // I · Projection & Maps (KQ-141..150)
  "terrain-relief": "projection",
  "little-planet": "projection",
  "arc-routes": "projection",
  "radar-scope": "projection",
  "fisheye-grid": "projection",
  "section-cut": "projection",
  "compass-needle": "projection",
  "blueprint-rise": "projection",
  "explode-view": "projection",
  "matrix-rise": "projection",

  // J · Mechanisms (KQ-151..160)
  "swing-door": "mechanisms",
  "hatch-board": "mechanisms",
  "gear-train": "mechanisms",
  "commit-lever": "mechanisms",
  "crank-reel": "mechanisms",
  "pulley-lift": "mechanisms",
  "combo-dials": "mechanisms",
  "zipper-seam": "mechanisms",
  "trapdoor-drop": "mechanisms",
  drawbridge: "mechanisms",
};

export const collectionBySlug = (slug: string): Collection | undefined =>
  COLLECTION_BY_SLUG.get(slug);

/** The collection an instrument belongs to, if it's a spatial instrument. */
export function collectionOf(item: { name: string }): Collection | undefined {
  const slug = COLLECTION_OF[item.name];
  return slug ? COLLECTION_BY_SLUG.get(slug) : undefined;
}

/**
 * Group spatial items by collection in wing order, dropping empty collections.
 * The item type is preserved so callers keep their manifest fields.
 */
export function itemsByCollection<T extends { name: string }>(
  items: T[],
): { collection: Collection; items: T[] }[] {
  const buckets = new Map<CollectionSlug, T[]>();
  for (const item of items) {
    const slug = COLLECTION_OF[item.name];
    if (!slug) continue;
    const bucket = buckets.get(slug);
    if (bucket) bucket.push(item);
    else buckets.set(slug, [item]);
  }
  return SPATIAL_COLLECTIONS.map((collection) => ({
    collection,
    items: buckets.get(collection.slug) ?? [],
  })).filter((group) => group.items.length > 0);
}

/**
 * Build-time guard: every spatial instrument must belong to a collection so
 * the sub-grouped nav never silently drops one. Throws (failing the SSG build
 * loudly) when a spatial item is missing from COLLECTION_OF.
 */
export function assertSpatialCollections(
  items: { name: string; categories?: string[] }[],
): void {
  const unmapped = items
    .filter((item) => categoryOf(item) === "spatial" && !COLLECTION_OF[item.name])
    .map((item) => item.name);
  if (unmapped.length > 0) {
    throw new Error(
      `Spatial instrument(s) missing a collection in content/collections.ts: ${unmapped.join(", ")}`,
    );
  }
}
