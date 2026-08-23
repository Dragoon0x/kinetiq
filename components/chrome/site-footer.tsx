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
        <div className="flex gap-16">
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
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 text-label text-ink-3">
          <span>KINETIQ · MOTION LABORATORY</span>
          <a
            href={author.url}
            target="_blank"
            rel="me noreferrer"
            className="transition-colors hover:text-ink-2"
          >
            BUILT BY {author.name.toUpperCase()} · {author.handle.toUpperCase()}
          </a>
          <span>EST. 2026</span>
        </div>
      </div>
    </footer>
  );
}
