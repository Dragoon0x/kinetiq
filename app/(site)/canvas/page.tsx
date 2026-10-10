import type { Metadata } from "next";
import { Suspense } from "react";

import { CanvasGallery } from "@/components/canvas/canvas-gallery";
import { JsonLd } from "@/components/seo/json-ld";
import type { TactileItem } from "@/components/tactile/tactile-card";
import { StaticGrid } from "@/components/tactile/static-grid";
import {
  assertCanvas,
  CANVAS_OF,
  liveCanvasSets,
  setBySlug,
} from "@/content/canvas";
import { categoryOf } from "@/content/categories";
import { catalogComponents } from "@/content/manifest";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, webPageLd } from "@/lib/structured-data";

const DESCRIPTION =
  "Canvas: original React animation pieces made with care — text that arrives and settles, micro-interactions with real physics, cursor and reveal effects, and living WebGL backgrounds. Every piece is live, tweakable and ready to install.";

export const metadata: Metadata = pageMeta({
  title: "Canvas",
  description: DESCRIPTION,
  path: "/canvas",
  keywords: [
    "React text animations",
    "animated backgrounds",
    "WebGL backgrounds",
    "cursor effects",
    "React micro-interactions",
    "React animation components",
    "shader backgrounds",
  ],
});

/** How many of the most recent pieces wear the New mark. */
const NEW_COUNT = 12;

const pascal = (slug: string) =>
  slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

export default function CanvasPage() {
  // Fails the build loudly if a Canvas piece has no set or card shape.
  assertCanvas(catalogComponents);

  const members = catalogComponents.filter((c) => categoryOf(c) === "canvas");
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
    const place = CANVAS_OF[c.name] ?? { set: "text", aspect: "wide" };
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
  const setsInUse = liveCanvasSets(members).length;

  return (
    <main>
      <JsonLd
        data={[
          webPageLd({
            name: "Canvas",
            description: DESCRIPTION,
            path: "/canvas",
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Canvas", path: "/canvas" },
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
            CANVAS · {String(items.length).padStart(2, "0")}{" "}
            {items.length === 1 ? "PIECE" : "PIECES"} ·{" "}
            {String(setsInUse).padStart(2, "0")}{" "}
            {setsInUse === 1 ? "SET" : "SETS"}
          </p>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-tight text-balance text-ink sm:text-6xl">
            Motion you can see, touch and keep.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-balance text-ink-2">
            Type that arrives and settles, micro-interactions with real physics,
            cursor and reveal effects, and living backgrounds — each one
            original. Play with any piece right here, tune it on the stage, then
            take the exact code with you.
          </p>
        </div>
      </section>

      <Suspense fallback={<StaticGrid items={items} />}>
        <CanvasGallery items={items} />
      </Suspense>
    </main>
  );
}
