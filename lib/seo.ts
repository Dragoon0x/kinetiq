import type { Metadata } from "next";

import { author, siteConfig } from "./site-config";

/**
 * Page metadata that carries its own identity into every share.
 *
 * The root layout's Open Graph block is inherited wholesale by any page that
 * does not set one, so before this helper a link to any component, guide or
 * template unfurled as the home page — its title, its description, its URL.
 * Every page now states its own title, description, canonical and card copy
 * in one call, and the file-convention OG image is merged in by Next.
 */
export type PageMeta = {
  /** The page's own title; the layout template appends the site name. */
  title: string;
  description: string;
  /** Site-relative path, e.g. "/components/pressure-button". */
  path: string;
  keywords?: readonly string[];
  /** Open Graph type. Articles get `article`; everything else is a website. */
  type?: "website" | "article";
  /** Keep a page out of search without hiding it from crawlers. */
  noindex?: boolean;
};

/** Open Graph and Twitter clip long descriptions; end on a sentence. */
export function shareDescription(text: string, max = 200): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

export function pageMeta({
  title,
  description,
  path,
  keywords,
  type = "website",
  noindex,
}: PageMeta): Metadata {
  const shareTitle = `${title} · ${siteConfig.name}`;
  const share = shareDescription(description);
  return {
    title,
    description,
    keywords: keywords ? [...keywords] : undefined,
    alternates: { canonical: path },
    robots: noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type,
      url: path,
      siteName: siteConfig.name,
      locale: "en_US",
      title: shareTitle,
      description: share,
    },
    twitter: {
      card: "summary_large_image",
      site: author.x,
      creator: author.x,
      title: shareTitle,
      description: share,
    },
  };
}
