"use client";

import * as React from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";

import { MotionTestSwitch } from "@/components/chrome/motion-test-switch";
import { ThemeToggle } from "@/components/chrome/theme-toggle";
import { Wordmark } from "@/components/chrome/wordmark";
import { CommandDeck } from "@/components/search/command-deck";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor } from "@/registry/lib/motion";
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

/**
 * The eight destinations need 671px of row. That fits from 1152px up, so the
 * inline nav starts at `xl` and everything below it gets a real menu.
 *
 * It used to be an overflow-x-auto strip with the scrollbar hidden, which
 * meant that on a phone you saw "Components", half of "Explore", and no
 * indication whatsoever that six more destinations existed — no scrollbar, no
 * affordance, no menu. The links were reachable only by guessing you could
 * drag a row that gave no sign of being draggable.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const motionSafe = useMotionSafe();
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Arriving somewhere new closes the menu — otherwise it hangs over the page
  // the reader just asked for. Adjusted during render rather than in an
  // effect: closing in an effect sets state synchronously after paint and
  // cascades an extra render, which the lint rightly refuses. This covers
  // back and forward too, not just a click on a link in the panel.
  const [lastPath, setLastPath] = React.useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // Opening moves focus into the panel so the keyboard lands where the eye does.
  React.useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
  }, [open]);

  const linkClass = (active: boolean) =>
    cn(
      "rounded-2 font-medium transition-colors",
      active ? "bg-surface-1 text-ink" : "text-ink-2 hover:text-ink",
    );

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface-0/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link href="/" className="shrink-0">
            <Wordmark />
          </Link>

          {/* The full row, only where all eight fit without clipping. */}
          <nav
            aria-label="Primary"
            className="hidden items-center gap-1 xl:flex"
          >
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(linkClass(active), "px-3 py-1.5 text-sm")}
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

          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink xl:hidden"
          >
            {open ? (
              <X className="size-4" aria-hidden />
            ) : (
              <Menu className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* Below xl the destinations live here, stacked and all reachable. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            ref={panelRef}
            initial={{ opacity: 0, y: motionSafe ? -4 : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              transition: exitFor(motionSafe ? durations.fast : 0),
            }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
            className="border-t border-hairline bg-surface-0 xl:hidden"
          >
            <nav
              aria-label="Primary"
              className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6"
            >
              <ul className="flex flex-col">
                {NAV.map((item) => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          linkClass(active),
                          "block px-3 py-2.5 text-base",
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
