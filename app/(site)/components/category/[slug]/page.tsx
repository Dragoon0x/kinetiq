import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  CATEGORIES,
  categoryBySlug,
  categoryOf,
} from "@/content/categories";
import { catalogComponents } from "@/content/manifest";

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
  return {
    title: `${category.label} components`,
    description: category.blurb,
  };
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
      <nav aria-label="Breadcrumb" className="text-ink-3 flex gap-2 text-sm">
        <Link
          href="/components"
          className="hover:text-ink transition-colors"
        >
          Components
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-2">{category.label}</span>
      </nav>

      <p className="text-label text-ink-3 mt-8">
        {category.slug} · {String(items.length).padStart(2, "0")} INSTRUMENTS
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {category.label}
      </h1>
      <p className="text-ink-2 mt-3 max-w-xl text-base">{category.blurb}</p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((component) => (
          <li key={component.name}>
            <Link
              href={`/components/${component.name}`}
              className="group border-hairline bg-surface-1 hover:border-hairline-strong block h-full rounded-3 border p-5 transition-colors"
            >
              <p className="text-label text-ink-3">{component.meta?.serial}</p>
              <h2 className="group-hover:text-cobalt-bright mt-3 font-semibold transition-colors">
                {component.title}
              </h2>
              <p className="text-ink-2 mt-1.5 text-sm">{component.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href={`/explore?category=${category.slug}`}
        className="text-ink-2 hover:text-ink mt-10 inline-flex items-center gap-2 text-sm transition-colors"
      >
        See {category.label} live in the explorer
        <span aria-hidden>→</span>
      </Link>
    </main>
  );
}
