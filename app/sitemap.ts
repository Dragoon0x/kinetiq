import type { MetadataRoute } from "next";

import { itemsByCategory } from "@/content/categories";
import { guides } from "@/content/guides";
import { labs } from "@/content/labs";
import { catalogBlocks, catalogComponents } from "@/content/manifest";
import { siteConfig } from "@/lib/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/components",
    "/explore",
    "/blocks",
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
