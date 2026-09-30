import type { Metadata } from "next";
import { Suspense } from "react";

import { JsonLd } from "@/components/seo/json-ld";
import { TactileGallery } from "@/components/tactile/gallery";
import type { TactileItem } from "@/components/tactile/tactile-card";
import { StaticGrid } from "@/components/tactile/static-grid";
import { categoryOf } from "@/content/categories";
import { catalogComponents } from "@/content/manifest";
import {
  assertTactile,
  TACTILE_OF,
  TACTILE_VERBS,
  verbBySlug,
} from "@/content/tactile";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, webPageLd } from "@/lib/structured-data";

const DESCRIPTION =
  "Components you can feel: pressed, held, dragged, thrown and turned. Every Tactile component is live, with its own physics, synthesised sound, and tweaks you can share.";

export const metadata: Metadata = pageMeta({
  title: "Tactile",
  description: DESCRIPTION,
  path: "/tactile",
  keywords: [
    "interactive components",
    "tactile UI",
    "React interactions",
    "micro-interactions",
    "gesture components",
  ],
});

/** How many of the most recent components wear the New mark. */
const NEW_COUNT = 12;

const pascal = (slug: string) =>
  slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

export default function TactilePage() {
  // Fails the build loudly if a Tactile component has no verb or card shape.
  assertTactile(catalogComponents);

  const members = catalogComponents.filter((c) => categoryOf(c) === "tactile");
  const newest = new Set(
    [...members]
      .sort((a, b) =>
        (b.meta?.serial ?? "").localeCompare(a.meta?.serial ?? "", undefined, {
          numeric: true,
        }),
      )
      .slice(0, NEW_COUNT)
      .map((c) => c.name),
  );
  const items: TactileItem[] = members.map((c) => {
    const place = TACTILE_OF[c.name] ?? { verb: "press", aspect: "square" };
    return {
      name: c.name,
      title: c.title,
      tagline: c.tagline ?? "",
      serial: c.meta?.serial ?? "",
      verb: place.verb,
      verbLabel: verbBySlug(place.verb)?.label ?? place.verb,
      aspect: place.aspect,
      exportName: pascal(c.name),
      isNew: newest.has(c.name),
    };
  });
  const verbsInUse = TACTILE_VERBS.filter((v) =>
    items.some((i) => i.verb === v.slug),
  ).length;

  return (
    <main>
      <JsonLd
        data={[
          webPageLd({
            name: "Tactile",
            description: DESCRIPTION,
            path: "/tactile",
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Tactile", path: "/tactile" },
          ]),
        ]}
      />
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-grid bg-grid-fade"
        />
        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center px-6 pt-20 pb-14 text-center sm:pt-24">
          <p className="text-label text-ink-3">
            TACTILE · {String(items.length).padStart(2, "0")}{" "}
            {items.length === 1 ? "COMPONENT" : "COMPONENTS"} ·{" "}
            {String(verbsInUse).padStart(2, "0")}{" "}
            {verbsInUse === 1 ? "VERB" : "VERBS"}
          </p>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-tight text-balance text-ink sm:text-6xl">
            Components you can feel.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-balance text-ink-2">
            Pressed, held, dragged, thrown and turned. Every one is live right
            here — open it on the stage to tweak its physics, hear it, and take
            the exact code with you.
          </p>
        </div>
      </section>

      <Suspense fallback={<StaticGrid items={items} />}>
        <TactileGallery items={items} />
      </Suspense>
    </main>
  );
}
