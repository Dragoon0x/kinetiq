import Link from "next/link";

import { templateKindOf } from "@/content/template-categories";
import { catalogTemplates } from "@/content/manifest";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Templates",
  description:
    "Complete landing sites, each assembled end to end from shipped Kinetiq sections — navbar through footer, no page-local markup.",
};

export default function TemplatesIndexPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="max-w-2xl">
        <p className="text-label text-ink-3">Templates</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance">
          Complete sites, assembled.
        </h1>
        <p className="mt-4 leading-relaxed text-ink-2">
          Each of these is one page composed entirely from shipped sections —
          navbar through footer, with no markup of its own. A template
          contributes a running order and the argument that order makes; swap
          the narrative through each section&rsquo;s typed props.
        </p>
      </header>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2">
        {catalogTemplates.map((template) => {
          const kind = templateKindOf(template);
          return (
            <li key={template.name}>
              <Link
                href={`/templates/${template.name}`}
                className="group block h-full rounded-3 border border-hairline bg-surface-1 p-6 transition-colors hover:border-hairline-strong"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-label text-ink-3">
                    {template.meta?.serial}
                  </p>
                  {kind && (
                    <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      {kind.label}
                    </p>
                  )}
                </div>
                <h2 className="mt-3 text-lg font-semibold transition-colors group-hover:text-cobalt-bright">
                  {template.title}
                </h2>
                <p className="mt-1.5 text-sm text-ink-2">{template.tagline}</p>
                {kind && (
                  <p className="mt-4 border-t border-hairline pt-3 text-xs leading-relaxed text-ink-3">
                    {kind.blurb}
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-12 border-t border-hairline pt-6 text-xs leading-relaxed text-ink-3">
        Every kind above is represented once. If a template needed markup a
        section could have owned, that would mean a missing section rather than
        page-local styling — so none of them have any.
      </p>
    </div>
  );
}
