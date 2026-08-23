"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MotionTestSwitch } from "@/components/chrome/motion-test-switch";
import { ThemeToggle } from "@/components/chrome/theme-toggle";
import { Wordmark } from "@/components/chrome/wordmark";
import { CommandDeck } from "@/components/search/command-deck";
import { cn } from "@/registry/lib/utils";

const NAV = [
  { href: "/components", label: "Components" },
  { href: "/explore", label: "Explore" },
  { href: "/spatial", label: "Spatial" },
  { href: "/blocks", label: "Blocks" },
  { href: "/pages", label: "Pages" },
  { href: "/templates", label: "Templates" },
  { href: "/playground", label: "Playground" },
  { href: "/guides", label: "Guides" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface-0/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link href="/" className="shrink-0">
            <Wordmark />
          </Link>
          <nav
            aria-label="Primary"
            className="flex [scrollbar-width:none] items-center gap-0.5 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] sm:gap-1 [&::-webkit-scrollbar]:hidden"
          >
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-2 px-2 py-1.5 text-[13px] font-medium transition-colors sm:px-3 sm:text-sm",
                    active
                      ? "bg-surface-1 text-ink"
                      : "text-ink-2 hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <CommandDeck />
          <MotionTestSwitch />
          <ThemeToggle className="flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink" />
        </div>
      </div>
    </header>
  );
}
