import type { Metadata } from "next";
import Link from "next/link";

import { itemsByCategory } from "@/content/categories";
import { catalogComponents } from "@/content/manifest";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, collectionLd } from "@/lib/structured-data";

export const metadata: Metadata = pageMeta({
  title: "Components",
  description:
    "Motion components that share one physics vocabulary — five calibrated springs.",
  path: "/components",
  keywords: [
    "React components",
    "animated components",
    "spring animation",
    "UI kit",
  ],
});

export default function ComponentsIndexPage() {
  const categoryGroups = itemsByCategory(catalogComponents);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <JsonLd
        data={[
          collectionLd({
            name: "Components",
            description:
              "Motion components that share one physics vocabulary \u2014 five calibrated springs.",
            path: "/components",
            items: catalogComponents.map((c) => ({
              name: c.title,
              path: `/components/${c.name}`,
            })),
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Components", path: "/components" },
          ]),
        ]}
      />
      <p className="text-label text-ink-3">
        INDEX · {String(catalogComponents.length).padStart(2, "0")} INSTRUMENTS
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Components</h1>
      <p className="mt-3 max-w-xl text-ink-2">
        Every instrument draws from the same five calibrated springs, so
        anything you compose feels machined from one piece.
      </p>

      <nav aria-label="Categories" className="mt-8 flex flex-wrap gap-2">
        {categoryGroups.map(({ category, items }) => (
          <Link
            key={category.slug}
            href={`/components/category/${category.slug}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-sm text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink"
          >
            {category.label}
            <span aria-hidden className="font-mono text-[10px] text-ink-3">
              {items.length}
            </span>
          </Link>
        ))}
      </nav>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {catalogComponents.map((component) => (
          <li key={component.name}>
            <Link
              href={`/components/${component.name}`}
              className="group block h-full rounded-3 border border-hairline bg-surface-1 p-5 transition-colors hover:border-hairline-strong"
            >
              <p className="text-label text-ink-3">{component.meta?.serial}</p>
              <h2 className="mt-3 font-semibold transition-colors group-hover:text-cobalt-bright">
                {component.title}
              </h2>
              <p className="mt-1.5 text-sm text-ink-2">{component.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
