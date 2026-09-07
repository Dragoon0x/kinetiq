import type { Metadata } from "next";
import Link from "next/link";

import { LazyPlate } from "@/components/explore/lazy-plate";
import { categoryOf } from "@/content/categories";
import { SPATIAL_COLLECTIONS, itemsByCollection } from "@/content/collections";
import { catalogComponents } from "@/content/manifest";
import { Wavefield } from "@/registry/ui/wavefield";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, webPageLd } from "@/lib/structured-data";

export const metadata: Metadata = pageMeta({
  title: "The Spatial Wing",
  description:
    "Depth as a material — Kinetiq's spatial collections: objects, cameras, surfaces, volumetrics, and mechanisms, every one live.",
  path: "/spatial",
  keywords: ["3D components", "spatial UI", "depth", "parallax", "React 3D"],
});

/** Live demos shown per hall before the "all" link takes over. */
const HALL_PLATES = 4;

export default function SpatialPage() {
  const instruments = catalogComponents.filter(
    (c) => categoryOf(c) === "spatial",
  );
  const halls = itemsByCollection(instruments);

  return (
    <main>
      <JsonLd
        data={[
          webPageLd({
            name: "The Spatial Wing",
            description:
              "Depth as a material \u2014 Kinetiq's spatial collections: objects, cameras, surfaces, volumetrics, and mechanisms, every one live.",
            path: "/spatial",
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "The Spatial Wing", path: "/spatial" },
          ]),
        ]}
      />
      {/* marquee — a self-pausing contour field behind an aria-hidden layer;
          the mask never touches the content. */}
      <section className="relative overflow-hidden">
        <Wavefield
          variant="contour"
          density={0.5}
          speed={0.35}
          opacity={0.35}
          className="pointer-events-none absolute inset-0"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-grid bg-grid-fade"
        />
        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center px-6 pt-24 pb-20 text-center">
          <p className="text-label text-ink-3">
            SPATIAL WING · {String(instruments.length).padStart(3, "0")}{" "}
            INSTRUMENTS · {String(halls.length).padStart(2, "0")} COLLECTIONS
          </p>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-tight text-balance text-ink sm:text-6xl">
            Depth is a material.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-balance text-ink-2">
            The wing where the z-axis goes to work — objects you can spin,
            cameras you can ride, surfaces that fold, and machinery with real
            hinges. Every instrument on the same five springs.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/explore?category=spatial"
              className="rounded-2 bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Run the wing in the explorer
            </Link>
            <Link
              href="/components/category/spatial"
              className="rounded-2 border border-input px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-accent"
            >
              Browse the index
            </Link>
          </div>
        </div>
      </section>

      {/* collection rail — jump straight to a hall */}
      <nav
        aria-label="Collections"
        className="sticky top-14 z-10 border-y border-hairline bg-surface-0/80 backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-7xl [scrollbar-width:none] gap-1.5 overflow-x-auto px-6 py-3 whitespace-nowrap [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {halls.map(({ collection, items }) => (
            <a
              key={collection.slug}
              href={`#${collection.slug}`}
              className="rounded-full border border-hairline px-3 py-1 text-sm text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink"
            >
              {collection.label}
              <span
                aria-hidden
                className="ml-1.5 font-mono text-[10px] text-ink-3"
              >
                {String(items.length).padStart(2, "0")}
              </span>
            </a>
          ))}
        </div>
      </nav>

      {/* the halls */}
      <div className="mx-auto w-full max-w-7xl px-6 pb-20">
        {halls.map(({ collection, items }, hallIndex) => (
          <section
            key={collection.slug}
            id={collection.slug}
            className="scroll-mt-28 pt-16"
          >
            <p aria-hidden className="text-label text-ink-3">
              HALL {String(hallIndex + 1).padStart(2, "0")} ·{" "}
              {String(items.length).padStart(2, "0")} INSTRUMENTS
            </p>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {collection.label}
              </h2>
              <Link
                href={`/components/category/spatial#${collection.slug}`}
                className="text-sm text-ink-2 transition-colors hover:text-ink"
              >
                All {items.length} in the index <span aria-hidden>→</span>
              </Link>
            </div>
            <p className="mt-2 max-w-xl text-base text-ink-2">
              {collection.blurb}
            </p>

            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {items.slice(0, HALL_PLATES).map((item) => (
                <li key={item.name} className="min-w-0">
                  <LazyPlate
                    slug={item.name}
                    serial={item.meta?.serial ?? "KQ-000"}
                    label={item.name.replace(/-/g, "/").toUpperCase()}
                    tagline={item.tagline}
                    minHeight={300}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* closing plate */}
        <section className="mt-20 rounded-4 border border-hairline p-10 text-center">
          <p className="text-label text-ink-3">
            {String(SPATIAL_COLLECTIONS.length).padStart(2, "0")} COLLECTIONS ·
            ONE CALIBRATION SET
          </p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Every hall runs on the same five springs.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-base text-ink-2">
            Filter the wing by collection in the explorer, or open any
            instrument page for its source, props, and install command.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/explore?category=spatial"
              className="rounded-2 bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open the explorer
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
