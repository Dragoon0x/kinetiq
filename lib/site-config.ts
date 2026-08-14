/**
 * A stand-in origin hardcoded in source docs (the AGENTS.md rules) that build
 * scripts rewrite to the resolved origin, so no artifact or offline snapshot
 * ever ships a dead install URL. Not a real destination — only a rewrite token.
 */
export const PLACEHOLDER_ORIGIN = "https://kinetiq.dev";

/** The live production origin, used when no deploy env var overrides it. */
const CANONICAL_ORIGIN = "https://kinetiqui.vercel.app";

/**
 * The canonical origin. Everything that emits an absolute URL — registry
 * install commands, machine catalog, llms.txt, sitemap, OG images — derives
 * from this, in both the Next runtime and the standalone tsx generate scripts.
 * Resolution order: an explicit NEXT_PUBLIC_SITE_URL (set once a custom domain
 * is attached) wins; on Vercel we otherwise take the deployment's own
 * production domain; everything else (local dev, CI, the committed snapshot)
 * uses the live production origin so generated artifacts are stable.
 */
const resolveSiteUrl = () => {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return CANONICAL_ORIGIN;
};

/**
 * The person behind the library. Single source of truth — the footer, the page
 * metadata, the OG/X card, the registry index, and every published registry
 * artifact all read from here, so the credit can never drift between surfaces.
 */
export const author = {
  name: "Dragoon",
  handle: "0xDragoon",
  /** The X handle, in the @form the card metadata expects. */
  x: "@0xDragoonLab",
  url: "https://x.com/0xDragoonLab",
  role: "Maker, founder, and builder",
} as const;

/** `Name (handle) <url>` — the form registry consumers and npm both expect. */
export const authorCredit = `${author.name} (${author.handle}) <${author.url}>`;

export const siteConfig = {
  name: "Kinetiq",
  tagline: "Motion, calibrated.",
  description:
    "A React component library where every animation shares five calibrated springs. Copy the source. Own the code. Ship interfaces that feel machined.",
  /** Registry item URLs and OG/llms metadata derive from this. */
  url: resolveSiteUrl(),
  registryNamespace: "@kinetiq",
  registryName: "kinetiq",
} as const;

export const REGISTRY_ITEM_URL = (slug: string) =>
  `${siteConfig.url}/r/${slug}.json`;

/**
 * Rewrite the placeholder origin embedded in inlined doc text (the AGENTS.md
 * rules) to the resolved origin, so registry artifacts and the offline MCP
 * snapshot never ship a dead install URL. A no-op on local builds, where the
 * resolved origin is still the placeholder.
 */
export const resolveOrigin = (text: string) =>
  siteConfig.url === PLACEHOLDER_ORIGIN
    ? text
    : text.replaceAll(PLACEHOLDER_ORIGIN, siteConfig.url);
