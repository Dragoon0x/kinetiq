"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";

export type QuietLink = { label: string; href: string };

export type FooterQuietCloseProps = {
  brand?: React.ReactNode;
  links?: QuietLink[];
  fineprint?: string;
  /** The one human line above the legal one. */
  signoff?: string;
  className?: string;
};

const DEFAULT_LINKS: QuietLink[] = [
  { label: "Journal", href: "#journal" },
  { label: "Docs", href: "#docs" },
  { label: "Status", href: "#status" },
  { label: "Privacy", href: "#privacy" },
  { label: "Terms", href: "#terms" },
];

/**
 * The quiet close: one row — wordmark, links, fine print — and one human
 * sign-off line above it. For pages whose footer's whole job is to end
 * gracefully: no columns, no form, no wordmark theatrics, just the page
 * signing its name and stepping back. The stillness is the design.
 */
export function FooterQuietClose({
  brand = <span className="font-semibold tracking-tight">Basinworks</span>,
  links = DEFAULT_LINKS,
  fineprint = "© 2026 Basinworks Field Systems",
  signoff = "Built slowly, by people who answer their own support mail.",
  className,
}: FooterQuietCloseProps) {
  return (
    <footer className={cn("border-hairline bg-surface-0 border-t", className)}>
      <div className="mx-auto w-full max-w-7xl px-6 py-10">
        <p className="text-ink-3 text-sm">{signoff}</p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          {brand}
          <nav aria-label="Footer">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-ink-2 hover:text-ink text-sm transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <span className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">
            {fineprint}
          </span>
        </div>
      </div>
    </footer>
  );
}
