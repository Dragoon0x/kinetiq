import Link from "next/link";

import { categoryBySlug } from "@/content/categories";
import { SHOWCASES } from "@/content/showcases";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Showcases",
  description:
    "Each category of the Kinetiq catalog, staged as a scene — the instruments running together rather than listed apart.",
};

/**
 * The parent of /showcase/[category]. It used to 404: the children were
 * reachable and linked from every category page and the sitemap, but
 * truncating the URL or reaching for the parent hit a dead end.
 */
export default function ShowcaseIndexPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="max-w-2xl">
        <p className="text-label text-ink-3">Showcases</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance">
          Each category, staged as a scene.
        </h1>
        <p className="mt-4 leading-relaxed text-ink-2">
          The instruments of a category running together, rather than listed
          apart. Every one is the same component you would install.
        </p>
      </header>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2">
        {SHOWCASES.map((showcase) => {
          const category = categoryBySlug(showcase.slug);
          return (
            <li key={showcase.slug}>
              <Link
                href={`/showcase/${showcase.slug}`}
                className="group block h-full rounded-3 border border-hairline bg-surface-1 p-6 transition-colors hover:border-hairline-strong"
              >
                <h2 className="text-lg font-semibold transition-colors group-hover:text-cobalt-bright">
                  {category?.label ?? showcase.slug}
                </h2>
                {category?.blurb ? (
                  <p className="mt-1.5 text-sm text-ink-2">{category.blurb}</p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
