/**
 * The origin baked into source docs (the AGENTS.md rules) before the real
 * deployment origin is known. Build scripts rewrite it to the resolved origin
 * so no artifact or offline snapshot ever ships a dead install URL.
 */
export const PLACEHOLDER_ORIGIN = "https://kinetiq.dev";

/**
 * The canonical origin. Everything that emits an absolute URL — registry
 * install commands, machine catalog, llms.txt, sitemap, OG images — derives
 * from this, in both the Next runtime and the standalone tsx generate scripts.
 * Resolution order: an explicit NEXT_PUBLIC_SITE_URL (set once a custom domain
 * is attached) wins; on Vercel we fall back to the deployment's own production
 * domain so a fresh deploy is self-consistent with no configuration; local
 * builds use the placeholder.
 */
const resolveSiteUrl = () => {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return PLACEHOLDER_ORIGIN;
};

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
