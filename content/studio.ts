/**
 * Studio's own taxonomy: the set each piece belongs to and the shape of the
 * card it lives in on /studio.
 *
 * Additive, like content/atelier.ts — the manifest is never rewritten. The
 * map is pre-filled for the whole roster so a piece slots into its set the
 * moment it lands in the manifest. Hook-free and import-light so server
 * components and build scripts can both read it.
 */

import { categoryOf } from "./categories";
import type { TactileAspect } from "./tactile";

export type StudioSet =
  | "toggles"
  | "buttons"
  | "cards"
  | "containers"
  | "ai"
  | "workspace"
  | "data"
  | "flows"
  | "commerce"
  | "screens";

export type StudioAspect = TactileAspect;

export type StudioGroup = {
  slug: StudioSet;
  label: string;
  blurb: string;
};

/** The ordered sets. Order drives the filter chips on /studio. */
export const STUDIO_SETS: StudioGroup[] = [
  {
    slug: "toggles",
    label: "Toggles",
    blurb: "Two states, each with its own physics.",
  },
  {
    slug: "buttons",
    label: "Buttons",
    blurb: "Actions that show you what happened.",
  },
  { slug: "cards", label: "Cards", blurb: "Records you can pick up and open." },
  {
    slug: "containers",
    label: "Containers",
    blurb: "Space that rearranges itself.",
  },
  { slug: "ai", label: "AI", blurb: "Surfaces for working with a model." },
  {
    slug: "workspace",
    label: "Workspace",
    blurb: "Where the day's work happens.",
  },
  { slug: "data", label: "Data", blurb: "Numbers you can steer." },
  { slug: "flows", label: "Flows", blurb: "Steps that never lose you." },
  { slug: "commerce", label: "Commerce", blurb: "From browsing to delivered." },
  {
    slug: "screens",
    label: "Screens",
    blurb: "Whole apps, ready to start from.",
  },
];

/**
 * Every Studio piece: its set, and its card on the wall — square, wide, tall,
 * or large (two columns by two rows) for whole app surfaces.
 */
export const STUDIO_OF: Record<
  string,
  { set: StudioSet; aspect: StudioAspect }
> = {
  "follow-knot": { set: "toggles", aspect: "square" },
  "mute-cone": { set: "toggles", aspect: "square" },
  "pin-press": { set: "toggles", aspect: "square" },
  "privacy-blinds": { set: "toggles", aspect: "square" },
  "renew-loop": { set: "toggles", aspect: "square" },
  "focus-moon": { set: "toggles", aspect: "square" },
  "repeat-coil": { set: "toggles", aspect: "square" },
  "latch-lock": { set: "toggles", aspect: "square" },
  "eye-lid": { set: "toggles", aspect: "square" },
  "wish-tag": { set: "toggles", aspect: "square" },
  "launch-pad": { set: "buttons", aspect: "wide" },
  "settle-button": { set: "buttons", aspect: "wide" },
  "download-tray": { set: "buttons", aspect: "square" },
  "bin-lid": { set: "buttons", aspect: "square" },
  "upload-orbit": { set: "buttons", aspect: "wide" },
  "publish-press": { set: "buttons", aspect: "wide" },
  "refresh-wind": { set: "buttons", aspect: "square" },
  "gate-button": { set: "buttons", aspect: "wide" },
  "rewind-undo": { set: "buttons", aspect: "wide" },
  "plug-in": { set: "buttons", aspect: "wide" },
  "profile-lift": { set: "cards", aspect: "tall" },
  "pricing-plinth": { set: "cards", aspect: "large" },
  "place-card": { set: "cards", aspect: "tall" },
  "track-card": { set: "cards", aspect: "wide" },
  "role-card": { set: "cards", aspect: "tall" },
  "lesson-card": { set: "cards", aspect: "square" },
  "team-fan": { set: "cards", aspect: "wide" },
  "swatch-card": { set: "cards", aspect: "tall" },
  "review-card": { set: "cards", aspect: "tall" },
  "meeting-card": { set: "cards", aspect: "wide" },
  "pane-stack": { set: "containers", aspect: "large" },
  "float-panel": { set: "containers", aspect: "large" },
  "tab-strip": { set: "containers", aspect: "wide" },
  "bridge-menu": { set: "containers", aspect: "wide" },
  "list-detail": { set: "containers", aspect: "large" },
  "push-sheet": { set: "containers", aspect: "tall" },
  "search-expand": { set: "containers", aspect: "wide" },
  "zoom-timeline": { set: "containers", aspect: "wide" },
  "snap-board": { set: "containers", aspect: "large" },
  "collapse-header": { set: "containers", aspect: "tall" },
  "answer-panel": { set: "ai", aspect: "large" },
  "agent-run": { set: "ai", aspect: "large" },
  "prompt-dock": { set: "ai", aspect: "wide" },
  "thread-view": { set: "ai", aspect: "large" },
  "usage-ledger": { set: "ai", aspect: "large" },
  "side-by-side": { set: "ai", aspect: "large" },
  "artifact-pane": { set: "ai", aspect: "large" },
  "voice-mode": { set: "ai", aspect: "tall" },
  "source-search": { set: "ai", aspect: "large" },
  "agent-inbox": { set: "ai", aspect: "large" },
  "app-shell": { set: "workspace", aspect: "large" },
  "command-center": { set: "workspace", aspect: "large" },
  "swim-board": { set: "workspace", aspect: "large" },
  "mail-inbox": { set: "workspace", aspect: "large" },
  "week-planner": { set: "workspace", aspect: "large" },
  "file-browser": { set: "workspace", aspect: "large" },
  "review-thread": { set: "workspace", aspect: "large" },
  "notice-center": { set: "workspace", aspect: "tall" },
  "block-editor": { set: "workspace", aspect: "large" },
  "member-roster": { set: "workspace", aspect: "large" },
  "data-grid": { set: "data", aspect: "large" },
  "pulse-dashboard": { set: "data", aspect: "large" },
  "funnel-flow": { set: "data", aspect: "large" },
  "status-board": { set: "data", aspect: "large" },
  "filter-builder": { set: "data", aspect: "large" },
  "cohort-grid": { set: "data", aspect: "large" },
  "activity-stream": { set: "data", aspect: "tall" },
  "region-map": { set: "data", aspect: "large" },
  "tree-map": { set: "data", aspect: "large" },
  "chart-morph": { set: "data", aspect: "large" },
  "setup-checklist": { set: "flows", aspect: "tall" },
  "sign-in": { set: "flows", aspect: "tall" },
  "upgrade-wall": { set: "flows", aspect: "large" },
  "billing-panel": { set: "flows", aspect: "large" },
  "settings-form": { set: "flows", aspect: "large" },
  "integration-hub": { set: "flows", aspect: "large" },
  "setup-wizard": { set: "flows", aspect: "large" },
  "feedback-widget": { set: "flows", aspect: "tall" },
  "help-panel": { set: "flows", aspect: "tall" },
  "invite-flow": { set: "flows", aspect: "wide" },
  "product-detail": { set: "commerce", aspect: "large" },
  "cart-drawer": { set: "commerce", aspect: "tall" },
  "checkout-flow": { set: "commerce", aspect: "large" },
  "order-tracker": { set: "commerce", aspect: "large" },
  "product-grid": { set: "commerce", aspect: "large" },
  "bundle-builder": { set: "commerce", aspect: "large" },
  "return-flow": { set: "commerce", aspect: "large" },
  "subscription-manager": { set: "commerce", aspect: "large" },
  "ratings-summary": { set: "commerce", aspect: "large" },
  "gift-builder": { set: "commerce", aspect: "large" },
  "ai-workspace": { set: "screens", aspect: "large" },
  "mail-client": { set: "screens", aspect: "large" },
  "music-app": { set: "screens", aspect: "large" },
  "bank-app": { set: "screens", aspect: "tall" },
  "project-tracker": { set: "screens", aspect: "large" },
  "analytics-console": { set: "screens", aspect: "large" },
  "team-chat": { set: "screens", aspect: "large" },
  "notes-app": { set: "screens", aspect: "large" },
  "calendar-app": { set: "screens", aspect: "large" },
  storefront: { set: "screens", aspect: "large" },
};

export const setBySlug = (slug: string): StudioGroup | undefined =>
  STUDIO_SETS.find((s) => s.slug === slug);

/** Fails loudly when a Studio piece lands in the manifest without a set. */
export function assertStudio(
  items: { name: string; categories?: string[] }[],
): void {
  const unmapped = items
    .filter((item) => categoryOf(item) === "studio" && !STUDIO_OF[item.name])
    .map((item) => item.name);
  if (unmapped.length > 0) {
    throw new Error(
      `Studio piece(s) missing a set in content/studio.ts: ${unmapped.join(", ")}`,
    );
  }
}
