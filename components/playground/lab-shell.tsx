import Link from "next/link";

import { labBySlug, labs } from "@/content/labs";

/**
 * The instrument chassis every lab renders in: header with serial + aha,
 * then the lab's own three-zone body (control rail / stage / code strip),
 * then prev/next bench navigation.
 */
export function LabShell({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const lab = labBySlug(slug);
  if (!lab) return null;
  const index = labs.findIndex((l) => l.slug === slug);
  const prev = labs[index - 1];
  const next = labs[index + 1];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <nav aria-label="Breadcrumb" className="text-ink-3 flex gap-2 text-sm">
        <Link href="/playground" className="hover:text-ink transition-colors">
          Playground
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-2">{lab.title}</span>
      </nav>

      <p className="text-label text-ink-3 mt-8">
        {lab.serial} · {lab.title.toUpperCase().replace(/ /g, "/")}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {lab.title}
      </h1>
      <p className="text-ink-2 mt-3 max-w-xl">{lab.tagline}</p>

      <div className="mt-8">{children}</div>

      <aside className="border-hairline bg-surface-1 mt-8 rounded-3 border p-4">
        <p className="text-label text-ink-3">WHAT THIS BENCH TEACHES</p>
        <p className="text-ink-2 mt-2 text-sm">{lab.aha}</p>
      </aside>

      <nav
        aria-label="Bench navigation"
        className="mt-10 flex items-center justify-between"
      >
        {prev ? (
          <Link
            href={`/playground/${prev.slug}`}
            className="text-ink-2 hover:text-ink text-sm font-medium transition-colors"
          >
            ← {prev.serial} {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/playground/${next.slug}`}
            className="text-ink-2 hover:text-ink text-sm font-medium transition-colors"
          >
            {next.serial} {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
