/**
 * Structured data for search engines and answer engines.
 *
 * Every builder returns plain JSON-LD objects so a page can compose the few
 * it needs and hand them to `<JsonLd>`. IDs are anchored on the site origin
 * so the same author and website nodes are shared across the whole graph.
 */
import type { KinetiqItem } from "../content/manifest/types";
import { author, siteConfig } from "./site-config";

const LICENSE_URL = "https://opensource.org/licenses/MIT";

const absolute = (path: string) => `${siteConfig.url}${path}`;

export const WEBSITE_ID = `${siteConfig.url}/#website`;
export const AUTHOR_ID = `${siteConfig.url}/#author`;

export function personLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": AUTHOR_ID,
    name: author.name,
    alternateName: author.handle,
    url: author.url,
    sameAs: [author.url],
    jobTitle: author.role,
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: siteConfig.name,
    alternateName: `${siteConfig.name} — ${siteConfig.tagline}`,
    url: siteConfig.url,
    description: siteConfig.description,
    inLanguage: "en",
    author: { "@id": AUTHOR_ID },
    publisher: { "@id": AUTHOR_ID },
  };
}

export type Crumb = { name: string; path: string };

export function breadcrumbLd(trail: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absolute(crumb.path),
    })),
  };
}

export type ItemKind = "components" | "blocks" | "pages" | "templates";

const KIND_NOUN: Record<ItemKind, string> = {
  components: "React component",
  blocks: "React section",
  pages: "React page",
  templates: "React site template",
};

/** A registry item: source code a reader installs, described as such. */
export function softwareLd(item: KinetiqItem, kind: ItemKind) {
  const path = `/${kind}/${item.name}`;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    "@id": `${absolute(path)}#code`,
    name: item.title,
    alternateName: item.meta?.serial,
    identifier: item.meta?.serial,
    description: item.description,
    abstract: item.tagline,
    url: absolute(path),
    programmingLanguage: "TypeScript",
    runtimePlatform: "React",
    codeSampleType: "full",
    genre: KIND_NOUN[kind],
    keywords: item.keywords.join(", "),
    license: LICENSE_URL,
    isAccessibleForFree: true,
    author: { "@id": AUTHOR_ID },
    isPartOf: { "@id": WEBSITE_ID },
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${siteConfig.url}/r/${item.name}.json`,
    },
  };
}

export function articleLd({
  headline,
  description,
  path,
  serial,
}: {
  headline: string;
  description: string;
  path: string;
  serial?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${absolute(path)}#article`,
    headline,
    description,
    identifier: serial,
    url: absolute(path),
    mainEntityOfPage: absolute(path),
    inLanguage: "en",
    isAccessibleForFree: true,
    author: { "@id": AUTHOR_ID },
    publisher: { "@id": AUTHOR_ID },
    isPartOf: { "@id": WEBSITE_ID },
  };
}

export function webPageLd({
  name,
  description,
  path,
}: {
  name: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": absolute(path),
    name,
    description,
    url: absolute(path),
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
  };
}

/** An index page, with the first entries of what it lists. */
export function collectionLd({
  name,
  description,
  path,
  items,
  limit = 60,
}: {
  name: string;
  description: string;
  path: string;
  items: Crumb[];
  limit?: number;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": absolute(path),
    name,
    description,
    url: absolute(path),
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.slice(0, limit).map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        url: absolute(item.path),
      })),
    },
  };
}
