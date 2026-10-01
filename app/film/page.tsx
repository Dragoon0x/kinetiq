import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { itemsByCategory } from "@/content/categories";
import {
  catalogBlocks,
  catalogComponents,
  catalogPages,
  catalogTemplates,
} from "@/content/manifest";
import type { Catalog } from "@/film/core/catalog";
import { LaunchFilm } from "@/film/launch-film";

export const metadata: Metadata = {
  title: "Launch film",
  robots: { index: false, follow: false },
};

/**
 * The launch film's composition. A production tool, not a page: it is only
 * served in development, or in a build made with KINETIQ_FILM=1. The film
 * reads the real catalog here, so every name, serial and count in it is the
 * library's own.
 */
export default function FilmPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.KINETIQ_FILM !== "1"
  ) {
    notFound();
  }
  const catalog: Catalog = {
    components: catalogComponents.map((item) => ({
      name: item.name,
      title: item.title,
      serial: item.meta?.serial ?? "",
      tagline: item.tagline,
    })),
    counts: {
      instruments: catalogComponents.length,
      assemblies: catalogBlocks.length,
      pages: catalogPages.length + catalogTemplates.length,
      categories: itemsByCategory(catalogComponents).length,
    },
  };
  return <LaunchFilm catalog={catalog} />;
}
