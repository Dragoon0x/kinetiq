import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CATEGORIES, categoryBySlug, categoryOf } from "@/content/categories";
import { itemsByCollection } from "@/content/collections";
import { catalogComponents } from "@/content/manifest";
import type { KinetiqItem } from "@/content/manifest/types";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, collectionLd } from "@/lib/structured-data";

export const dynamicParams = false;

/** Only categories that currently hold at least one component get a page. */
function presentCategories() {
  const present = new Set(catalogComponents.map((c) => categoryOf(c)));
  return CATEGORIES.filter((c) => present.has(c.slug));
}

export function generateStaticParams() {
  return presentCategories().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = categoryBySlug(slug);
  if (!category) return {};
  return pageMeta({
    title: `${category.label} components`,
    description: category.blurb,
    path: `/components/category/${slug}`,
    keywords: [category.label, "React components", "animated", "motion"],
  });
}

export default async function ComponentCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = categoryBySlug(slug);
  if (!category) notFound();

  const items = catalogComponents.filter(
    (c) => categoryOf(c) === category.slug,
  );
  if (items.length === 0) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <JsonLd
        data={[
          collectionLd({
            name: `${category.label} components`,
            description: category.blurb,
            path: `/components/category/${slug}`,
            items: items.map((c) => ({
              name: c.title,
              path: `/components/${c.name}`,
            })),
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Components", path: "/components" },
            { name: category.label, path: `/components/category/${slug}` },
          ]),
        ]}
      />
      <nav aria-label="Breadcrumb" className="flex gap-2 text-sm text-ink-3">
        <Link href="/components" className="transition-colors hover:text-ink">
          Components
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-2">{category.label}</span>
      </nav>

      <p className="mt-8 text-label text-ink-3">
        {category.slug} · {String(items.length).padStart(2, "0")} INSTRUMENTS
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {category.label}
      </h1>
      <p className="mt-3 max-w-xl text-base text-ink-2">{category.blurb}</p>

      <Link
        href={
          category.slug === "spatial"
            ? "/spatial"
            : `/showcase/${category.slug}`
        }
        className="mt-4 inline-flex items-center gap-2 text-sm text-cobalt-bright transition-colors hover:text-ink"
      >
        {category.slug === "spatial"
          ? "Enter the Spatial Wing"
          : `See the ${category.label} showcase`}
        <span aria-hidden>→</span>
      </Link>

      {category.slug === "spatial" ? (
        // The wing is navigated by collection — one anchored section each.
        <div className="mt-4">
          {itemsByCollection(items).map(({ collection, items: members }) => (
            <section
              key={collection.slug}
              id={collection.slug}
              className="mt-10 scroll-mt-24"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-xl font-semibold tracking-tight">
                  {collection.label}
                </h2>
                <p aria-hidden className="text-label text-ink-3">
                  {String(members.length).padStart(2, "0")}
                </p>
              </div>
              <p className="mt-1.5 max-w-xl text-sm text-ink-2">
                {collection.blurb}
              </p>
              <CardGrid items={members} headingLevel="h3" className="mt-5" />
            </section>
          ))}
        </div>
      ) : (
        <CardGrid items={items} headingLevel="h2" className="mt-10" />
      )}

      <Link
        href={`/explore?category=${category.slug}`}
        className="mt-10 inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-ink"
      >
        See {category.label} live in the explorer
        <span aria-hidden>→</span>
      </Link>
    </main>
  );
}

function CardGrid({
  items,
  headingLevel,
  className,
}: {
  items: KinetiqItem[];
  /** h2 under the page title, h3 under a collection heading. */
  headingLevel: "h2" | "h3";
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <ul
      className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className ?? ""}`}
    >
      {items.map((component) => (
        <li key={component.name}>
          <Link
            href={`/components/${component.name}`}
            className="group block h-full rounded-3 border border-hairline bg-surface-1 p-5 transition-colors hover:border-hairline-strong"
          >
            <p className="text-label text-ink-3">{component.meta?.serial}</p>
            <Heading className="mt-3 font-semibold transition-colors group-hover:text-cobalt-bright">
              {component.title}
            </Heading>
            <p className="mt-1.5 text-sm text-ink-2">{component.tagline}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
