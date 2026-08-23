"use client";

import * as React from "react";

import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusPip } from "@/registry/ui/status-pip";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DeskLink = { label: string; href: string };

export type NavSplitDeskProps = {
  brand?: React.ReactNode;
  /** The quiet top row — docs, status, sign in. */
  utilityLinks?: DeskLink[];
  statusLabel?: string;
  /** The working row. */
  links?: DeskLink[];
  cta?: string;
  onCta?: () => void;
  activeHref?: string;
  className?: string;
};

const DEFAULT_UTILITY: DeskLink[] = [
  { label: "Docs", href: "#docs" },
  { label: "Changelog", href: "#changelog" },
  { label: "Sign in", href: "#signin" },
];

const DEFAULT_LINKS: DeskLink[] = [
  { label: "Platform", href: "#platform" },
  { label: "Solutions", href: "#solutions" },
  { label: "Customers", href: "#customers" },
  { label: "Pricing", href: "#pricing" },
];

/**
 * A split desk header: the utility row above — small links, a live status
 * pip, quiet on purpose — and the working row below with the brand, the
 * primary links, and the one action. The two-level shape carries products
 * with an operations story: the top row says the thing is running; the
 * bottom row says what it is. The mobile fold merges both rows into one
 * list, utility last.
 */
export function NavSplitDesk({
  brand = (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <span
        aria-hidden
        className="bg-primary text-primary-foreground rounded-1 flex size-6 items-center justify-center font-mono text-[11px]"
      >
        K
      </span>
      Keeper
    </span>
  ),
  utilityLinks = DEFAULT_UTILITY,
  statusLabel = "All systems verified",
  links = DEFAULT_LINKS,
  cta = "Install the CLI",
  onCta,
  activeHref,
  className,
}: NavSplitDeskProps) {
  const motionSafe = useMotionSafe();
  const [open, setOpen] = React.useState(false);

  return (
    <header className={cn("bg-surface-0 border-hairline w-full border-b", className)}>
      {/* The utility row — hidden on small screens, merged into the fold. */}
      <div className="border-hairline hidden border-b md:block">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-1.5">
          <StatusPip status="online" label={statusLabel} className="text-xs" />
          <nav aria-label="Utility">
            <ul className="flex items-center gap-5">
              {utilityLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-ink-3 hover:text-ink text-xs transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <nav
        aria-label="Primary"
        className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-3"
      >
        {brand}
        <ul className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                aria-current={link.href === activeHref ? "page" : undefined}
                className={cn(
                  "rounded-2 hover:bg-surface-1 block px-3 py-1.5 text-sm transition-colors",
                  link.href === activeHref
                    ? "text-ink font-medium"
                    : "text-ink-2 hover:text-ink",
                )}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <PressureButton size="sm" onClick={onCta} className="hidden md:inline-flex">
            {cta}
          </PressureButton>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="split-desk-fold"
            aria-label={open ? "Close menu" : "Open menu"}
            className="border-hairline text-ink-2 hover:text-ink rounded-2 border p-2 transition-colors md:hidden"
          >
            {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
          </button>
        </div>
      </nav>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="split-desk-fold"
            className="border-hairline overflow-hidden border-t md:hidden"
            initial={motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.move }
                : { duration: durations.fast }
            }
          >
            <ul className="flex flex-col px-6 py-3">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="text-ink-2 hover:text-ink block py-2.5 text-sm transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li className="border-hairline mt-2 border-t pt-2">
                <ul className="flex flex-wrap gap-x-5 gap-y-1.5 py-1">
                  {utilityLinks.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="text-ink-3 hover:text-ink text-xs transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
              <li className="pt-2 pb-1">
                <PressureButton size="sm" onClick={onCta} className="w-full">
                  {cta}
                </PressureButton>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
