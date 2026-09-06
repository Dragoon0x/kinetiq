import Link from "next/link";

import { Wordmark } from "@/components/chrome/wordmark";
import { author } from "@/lib/site-config";

const COLUMNS = [
  {
    heading: "LIBRARY",
    links: [
      { href: "/components", label: "Components" },
      { href: "/explore", label: "Explore" },
      { href: "/spatial", label: "Spatial wing" },
      { href: "/blocks", label: "Blocks" },
      { href: "/pages", label: "Pages" },
      { href: "/templates", label: "Templates" },
    ],
  },
  {
    heading: "LEARN",
    links: [
      { href: "/playground", label: "Playground" },
      { href: "/guides", label: "Guides" },
    ],
  },
  {
    heading: "AGENTS",
    links: [
      { href: "/mcp", label: "MCP server" },
      { href: "/agents", label: "Registry access" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <Wordmark />
          <p className="mt-3 text-sm text-ink-3">
            Motion, calibrated. Every component on the same five springs.
          </p>
          <p className="mt-4 text-sm text-ink-3">
            {author.role} —{" "}
            <a
              href={author.url}
              target="_blank"
              rel="me noreferrer"
              className="text-ink-2 underline underline-offset-4 transition-colors hover:text-ink"
            >
              {author.name}
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-8 sm:gap-16">
          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <p className="text-label text-ink-3">{column.heading}</p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-2 transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-hairline">
        {/*
          Three equal tracks, not `justify-between`: between two neighbours of
          unequal width the credit would sit where the gaps happen to balance,
          well right of the page's centre. On a phone the bar stacks — the
          three lines do not fit across, and squeezed together they read as
          one sentence.
        */}
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-2 px-6 py-4 text-label text-ink-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-x-6">
          <span>KINETIQ · MOTION LABORATORY</span>
          <a
            href={author.url}
            target="_blank"
            rel="me noreferrer"
            className="transition-colors hover:text-ink-2"
          >
            BUILT BY {author.name.toUpperCase()} · {author.handle.toUpperCase()}
          </a>
          <span className="sm:justify-self-end">EST. 2026</span>
        </div>
      </div>
    </footer>
  );
}
