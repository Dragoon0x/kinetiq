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
  return "https://kinetiq.dev";
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
