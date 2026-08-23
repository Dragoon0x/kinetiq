import Link from "next/link";

import { pagesByFamily } from "@/content/page-categories";
import { catalogPages } from "@/content/manifest";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pages",
  description:
    "Whole page compositions — auth, onboarding, editorial, and every way a request can fail, assembled from the Kinetiq catalog.",
};

function PageCard({ page }: { page: (typeof catalogPages)[number] }) {
  return (
    <li>
      <Link
        href={`/pages/${page.name}`}
        className="group block h-full rounded-3 border border-hairline bg-surface-1 p-5 transition-colors hover:border-hairline-strong"
      >
        <p className="text-label text-ink-3">{page.meta?.serial}</p>
        <h3 className="mt-3 font-semibold transition-colors group-hover:text-cobalt-bright">
          {page.title}
        </h3>
        <p className="mt-1.5 text-sm text-ink-2">{page.tagline}</p>
      </Link>
    </li>
  );
}

export default function PagesIndexPage() {
  const groups = pagesByFamily(catalogPages);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="max-w-2xl">
        <p className="text-label text-ink-3">Pages</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance">
          Whole pages, assembled.
        </h1>
        <p className="mt-4 leading-relaxed text-ink-2">
          Complete compositions with a target path, so the CLI writes them where
          they belong rather than leaving you to place them. Each one is built
          from the same sections and instruments as everything else here.
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="mt-12 text-sm text-ink-3">Nothing published yet.</p>
      ) : (
        groups.map(({ family, items }) => (
          <section key={family.slug} className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-hairline pb-3">
              <h2 className="text-xl font-semibold tracking-tight">
                {family.label}
              </h2>
              <p className="font-mono text-[11px] text-ink-3">
                {items.length} {items.length === 1 ? "page" : "pages"}
              </p>
            </div>
            <p className="mt-3 max-w-2xl text-sm text-ink-2">{family.blurb}</p>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((page) => (
                <PageCard key={page.name} page={page} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
