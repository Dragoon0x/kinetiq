import type { Metadata } from "next";
import { Suspense } from "react";

import { AtelierGallery } from "@/components/atelier/atelier-gallery";
import { JsonLd } from "@/components/seo/json-ld";
import type { TactileItem } from "@/components/tactile/tactile-card";
import { StaticGrid } from "@/components/tactile/static-grid";
import {
  assertAtelier,
  ATELIER_OF,
  ATELIER_SETS,
  setBySlug,
} from "@/content/atelier";
import { categoryOf } from "@/content/categories";
import { catalogComponents } from "@/content/manifest";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, webPageLd } from "@/lib/structured-data";

const DESCRIPTION =
  "Everyday interface, made by hand: loaders for text, images and inline states, living widgets, notices, form fields, menus, device frames, keepsakes and backdrops. Every piece is live, tweakable and ready to install.";

export const metadata: Metadata = pageMeta({
  title: "Atelier",
  description: DESCRIPTION,
  path: "/atelier",
  keywords: [
    "React components",
    "animated loaders",
    "UI widgets",
    "notification components",
    "device mockups",
    "form fields",
    "animated backgrounds",
  ],
});

/** How many of the most recent pieces wear the New mark. */
const NEW_COUNT = 12;

const pascal = (slug: string) =>
  slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

export default function AtelierPage() {
  // Fails the build loudly if an Atelier piece has no set or card shape.
  assertAtelier(catalogComponents);

  const members = catalogComponents.filter((c) => categoryOf(c) === "atelier");
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
    const place = ATELIER_OF[c.name] ?? { set: "widgets", aspect: "square" };
    return {
      name: c.name,
      title: c.title,
      tagline: c.tagline ?? "",
      serial: c.meta?.serial ?? "",
      group: place.set,
      groupLabel: setBySlug(place.set)?.label ?? place.set,
      aspect: place.aspect,
      exportName: pascal(c.name),
      isNew: newest.has(c.name),
    };
  });
  const setsInUse = ATELIER_SETS.filter((s) =>
    items.some((i) => i.group === s.slug),
  ).length;

  return (
    <main>
      <JsonLd
        data={[
          webPageLd({
            name: "Atelier",
            description: DESCRIPTION,
            path: "/atelier",
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Atelier", path: "/atelier" },
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
            ATELIER · {String(items.length).padStart(2, "0")}{" "}
            {items.length === 1 ? "PIECE" : "PIECES"} ·{" "}
            {String(setsInUse).padStart(2, "0")}{" "}
            {setsInUse === 1 ? "SET" : "SETS"}
          </p>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-tight text-balance text-ink sm:text-6xl">
            Everyday interface, made by hand.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-balance text-ink-2">
            Loaders, widgets, notices, fields, menus, device frames, keepsakes
            and backdrops. Every piece is live right here — open it on the stage
            to tweak it, then take the exact code with you.
          </p>
        </div>
      </section>

      <Suspense fallback={<StaticGrid items={items} />}>
        <AtelierGallery items={items} />
      </Suspense>
    </main>
  );
}
