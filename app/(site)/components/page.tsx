import type { Metadata } from "next";
import Link from "next/link";

import { catalogComponents } from "@/content/manifest";

export const metadata: Metadata = {
  title: "Components",
  description:
    "Motion components that share one physics vocabulary — five calibrated springs.",
};

export default function ComponentsIndexPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <p className="text-label text-ink-3">
        INDEX · {String(catalogComponents.length).padStart(2, "0")} INSTRUMENTS
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Components</h1>
      <p className="text-ink-2 mt-3 max-w-xl">
        Every instrument draws from the same five calibrated springs, so
        anything you compose feels machined from one piece.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {catalogComponents.map((component) => (
          <li key={component.name}>
            <Link
              href={`/components/${component.name}`}
              className="group border-hairline bg-surface-1 hover:border-hairline-strong block h-full rounded-3 border p-5 transition-colors"
            >
              <p className="text-label text-ink-3">
                {component.meta?.serial}
              </p>
              <h2 className="group-hover:text-cobalt-bright mt-3 font-semibold transition-colors">
                {component.title}
              </h2>
              <p className="text-ink-2 mt-1.5 text-sm">{component.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
