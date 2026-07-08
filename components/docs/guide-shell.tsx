import Link from "next/link";

import { guideBySlug } from "@/content/guides";

export function GuideShell({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const guide = guideBySlug(slug);
  if (!guide) return null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <nav aria-label="Breadcrumb" className="text-ink-3 flex gap-2 text-sm">
        <Link href="/guides" className="hover:text-ink transition-colors">
          Guides
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-2">{guide.title}</span>
      </nav>
      <p className="text-label text-ink-3 mt-8">
        {guide.serial} · FIELD MANUAL
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {guide.title}
      </h1>
      <p className="text-ink-2 mt-3 max-w-xl">{guide.tagline}</p>
      <article className="prose-kinetiq mt-10 space-y-10">{children}</article>
    </main>
  );
}

export function GuideSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function GuideP({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-2 text-[15px] leading-relaxed">{children}</p>;
}

export function GuideTable({
  head,
  rows,
}: {
  head: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="border-hairline overflow-x-auto rounded-3 border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-hairline bg-surface-1 border-b">
            {head.map((h) => (
              <th key={h} className="text-label text-ink-3 px-4 py-2.5 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-hairline border-b last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={
                    j === 0
                      ? "px-4 py-2.5 align-top font-mono text-[13px]"
                      : "text-ink-2 px-4 py-2.5 align-top"
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
