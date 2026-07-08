export const siteConfig = {
  name: "Kinetiq",
  tagline: "Motion, calibrated.",
  description:
    "A React component library where every animation shares five calibrated springs. Copy the source. Own the code. Ship interfaces that feel machined.",
  /** Registry item URLs and OG/llms metadata derive from this. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://kinetiq.dev",
  registryNamespace: "@kinetiq",
  registryName: "kinetiq",
} as const;

export const REGISTRY_ITEM_URL = (slug: string) =>
  `${siteConfig.url}/r/${slug}.json`;
