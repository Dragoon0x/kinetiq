import type { MetadataRoute } from "next";

import { itemsByCategory } from "@/content/categories";
import { guides } from "@/content/guides";
import { labs } from "@/content/labs";
import {
  catalogBlocks,
  catalogComponents,
  catalogPages,
  catalogTemplates,
} from "@/content/manifest";
import { SHOWCASES } from "@/content/showcases";
import { siteConfig } from "@/lib/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/components",
    "/explore",
    "/spatial",
    "/blocks",
    "/pages",
    "/templates",
    "/showcase",
    "/playground",
    "/guides",
    "/agents",
    "/mcp",
  ];

  return [
    ...staticRoutes.map((route) => ({
      url: `${siteConfig.url}${route}`,
      changeFrequency: "weekly" as const,
      priority: route === "" ? 1 : 0.8,
    })),
    ...SHOWCASES.map((showcase) => ({
      url: `${siteConfig.url}/showcase/${showcase.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...itemsByCategory(catalogComponents).map(({ category }) => ({
      url: `${siteConfig.url}/components/category/${category.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...catalogComponents.map((c) => ({
      url: `${siteConfig.url}/components/${c.name}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...catalogBlocks.map((b) => ({
      url: `${siteConfig.url}/blocks/${b.name}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...catalogPages.map((p) => ({
      url: `${siteConfig.url}/pages/${p.name}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...catalogTemplates.map((t) => ({
      url: `${siteConfig.url}/templates/${t.name}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...labs.map((lab) => ({
      url: `${siteConfig.url}/playground/${lab.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...guides.map((guide) => ({
      url: `${siteConfig.url}/guides/${guide.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
