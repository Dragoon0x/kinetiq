import Link from "next/link";

import { LazyPlate } from "@/components/explore/lazy-plate";
import { HeroBackdrop, HeroHeadline, HeroStage } from "@/components/showcase/hero";
import type { Category } from "@/content/categories";
import type { KinetiqItem } from "@/content/manifest/types";
import type { Showcase } from "@/content/showcases";

const HEADLINE_CLASS =
  "text-ink mt-6 max-w-3xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl";

/**
 * One room per category: a hero that is the category demonstrating itself, a
 * few signature instruments mounted on intent, then the full set. The shell is
 * shared; everything bespoke — the copy, the hero and its mode, the curated
 * leads — comes from `content/showcases.ts`.
 *
 * Perf: exactly one live instrument (the hero); every other specimen is a
 * LazyPlate that only mounts when the visitor reaches for it.
 */
export function CategoryShowcase({
  showcase,
  category,
  items,
}: {
  showcase: Showcase;
  category: Category;
  items: KinetiqItem[];
}) {
  const { hero, headline, deck, leads, closing } = showcase;
  const leadItems = leads
    .map((slug) => items.find((item) => item.name === slug))
    .filter((item): item is KinetiqItem => Boolean(item));

  return (
    <main>
      {/* THE ROOM — the category showing itself off */}
      <section className="relative overflow-hidden">
        {hero.mode === "backdrop" && <HeroBackdrop slug={hero.slug} />}
        <div
          aria-hidden
          className="bg-grid bg-grid-fade pointer-events-none absolute inset-0"
        />
        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center px-6 pt-24 pb-20 text-center">
          <p className="text-label text-ink-3">
            {category.label.toUpperCase()} ·{" "}
            {String(items.length).padStart(2, "0")} INSTRUMENTS
          </p>

          {hero.mode === "headline" ? (
            <HeroHeadline
              slug={hero.slug}
              text={headline}
              className={HEADLINE_CLASS}
            />
          ) : (
            <h1 className={HEADLINE_CLASS}>{headline}</h1>
          )}

          <p className="text-ink-2 mt-6 max-w-xl text-lg text-balance">{deck}</p>

          {hero.mode === "stage" && (
            <div className="border-hairline bg-surface-1 mt-10 flex w-full max-w-lg items-center justify-center rounded-4 border p-6">
              <HeroStage slug={hero.slug} />
            </div>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/explore?category=${category.slug}`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-2 px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Run {category.label} in the explorer
            </Link>
            <Link
              href={`/components/category/${category.slug}`}
              className="border-input text-ink hover:bg-accent rounded-2 border px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Browse the index
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-6 pb-20">
        {/* SIGNATURES — curated, mounted on intent. Omitted while a category is
            still thin enough that its hero is the only instrument. */}
        {leadItems.length > 0 && (
        <section className="pt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Signature instruments
            </h2>
            <p aria-hidden className="text-label text-ink-3">
              MOUNTED ON INTENT
            </p>
          </div>
          <p className="text-ink-2 mt-2 max-w-xl text-base">{category.blurb}</p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {leadItems.map((item) => (
              <li key={item.name} className="min-w-0">
                <LazyPlate
                  slug={item.name}
                  serial={item.meta?.serial ?? "KQ-000"}
                  label={item.name.replace(/-/g, "/").toUpperCase()}
                  tagline={item.tagline ?? ""}
                  minHeight={300}
                />
              </li>
            ))}
          </ul>
        </section>
        )}

        {/* THE FULL SET — grows straight from the manifest */}
        <section className="pt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              The full set
            </h2>
            <Link
              href={`/components/category/${category.slug}`}
              className="text-ink-2 hover:text-ink text-sm transition-colors"
            >
              Open the index <span aria-hidden>→</span>
            </Link>
          </div>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={item.name}>
                <Link
                  href={`/components/${item.name}`}
                  className="group border-hairline bg-surface-1 hover:border-hairline-strong block h-full rounded-3 border p-5 transition-colors"
                >
                  <p className="text-label text-ink-3">{item.meta?.serial}</p>
                  <h3 className="group-hover:text-cobalt-bright mt-3 font-semibold transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-ink-2 mt-1.5 text-sm">{item.tagline}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* CLOSING */}
        <section className="border-hairline mt-20 rounded-4 border p-10 text-center">
          <p className="text-label text-ink-3">
            {category.label.toUpperCase()} · ONE CALIBRATION SET
          </p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {closing}
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/explore?category=${category.slug}`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-2 px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Open the explorer
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
