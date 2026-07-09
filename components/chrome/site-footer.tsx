import Link from "next/link";

import { Wordmark } from "@/components/chrome/wordmark";

const COLUMNS = [
  {
    heading: "LIBRARY",
    links: [
      { href: "/components", label: "Components" },
      { href: "/explore", label: "Explore" },
      { href: "/spatial", label: "Spatial wing" },
      { href: "/blocks", label: "Blocks" },
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
    <footer className="border-hairline border-t">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <Wordmark />
          <p className="text-ink-3 mt-3 text-sm">
            Motion, calibrated. Every component on the same five springs.
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
                      className="text-ink-2 hover:text-ink text-sm transition-colors"
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
      <div className="border-hairline border-t">
        <div className="text-label text-ink-3 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <span>KINETIQ · MOTION LABORATORY</span>
          <span>EST. 2026</span>
        </div>
      </div>
    </footer>
  );
}
