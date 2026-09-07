import type { Metadata } from "next";
import { Suspense } from "react";

import { Explorer, type ExploreItem } from "@/components/explore/explorer";
import { categoryOf } from "@/content/categories";
import { collectionOf } from "@/content/collections";
import { catalogComponents } from "@/content/manifest";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, webPageLd } from "@/lib/structured-data";

export const metadata: Metadata = pageMeta({
  title: "Explore",
  description:
    "Every Kinetiq instrument in one live gallery — filter by category or keyword and run any specimen in place.",
  path: "/explore",
  keywords: ["component gallery", "explore", "filter", "live demos"],
});

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f"];

export default function ExplorePage() {
  const items: ExploreItem[] = catalogComponents.map((c) => ({
    slug: c.name,
    title: c.title,
    tagline: c.tagline,
    serial: c.meta?.serial ?? "KQ-000",
    label: c.name.replace(/-/g, "/").toUpperCase(),
    category: categoryOf(c),
    collection: collectionOf(c)?.slug ?? null,
    keywords: c.keywords,
  }));

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-12">
      <JsonLd
        data={[
          webPageLd({
            name: "Explore",
            description:
              "Every Kinetiq instrument in one live gallery \u2014 filter by category or keyword and run any specimen in place.",
            path: "/explore",
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Explore", path: "/explore" },
          ]),
        ]}
      />
      <p className="text-label text-ink-3">
        EXPLORER · {String(items.length).padStart(2, "0")} INSTRUMENTS
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Explore</h1>
      <p className="mt-3 max-w-xl text-base text-ink-2">
        The whole catalog, live. Filter by category or keyword, switch the
        preview theme, and run any specimen in place — each one wakes on contact
        so the gallery stays light until you reach for it.
      </p>

      <Suspense fallback={<ExplorerSkeleton />}>
        <Explorer items={items} />
      </Suspense>
    </main>
  );
}

function ExplorerSkeleton() {
  return (
    <div className="mt-6">
      <div className="h-9 w-full max-w-sm rounded-2 border border-hairline bg-surface-1" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SKELETON_KEYS.map((key) => (
          <div
            key={key}
            className="h-[300px] rounded-3 border border-hairline bg-surface-1"
          />
        ))}
      </div>
    </div>
  );
}
