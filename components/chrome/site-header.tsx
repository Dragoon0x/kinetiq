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
  { href: "/blocks", label: "Blocks" },
  { href: "/playground", label: "Playground" },
  { href: "/guides", label: "Guides" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-hairline bg-surface-0/80 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-6 px-6">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="Kinetiq home" className="shrink-0">
            <Wordmark />
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-2 px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "text-ink bg-surface-1"
                      : "text-ink-2 hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <CommandDeck />
          <MotionTestSwitch />
          <ThemeToggle className="border-hairline text-ink-2 hover:text-ink hover:border-hairline-strong flex size-8 items-center justify-center rounded-2 border transition-colors" />
        </div>
      </div>
    </header>
  );
}
