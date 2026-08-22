"use client";

import * as React from "react";

import { Menu, X } from "lucide-react";

import { RevealStagger } from "@/registry/ui/reveal-stagger";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/registry/lib/utils";

export type PillLink = { label: string; href: string };

export type NavDockPillProps = {
  brand?: React.ReactNode;
  links?: PillLink[];
  cta?: string;
  onCta?: () => void;
  activeHref?: string;
  className?: string;
};

const DEFAULT_LINKS: PillLink[] = [
  { label: "Overview", href: "#overview" },
  { label: "Recipes", href: "#recipes" },
  { label: "Journal", href: "#journal" },
  { label: "Pricing", href: "#pricing" },
];

/**
 * A floating pill dock, moored top-center of the page rather than spanning
 * it. The active page carries a seated dot; choosing another link sends the
 * dot sliding along the pill on `snap` via a shared layout id — one dot, one
 * home, always somewhere. On small screens the pill holds brand and a
 * menu button, and the fold opens as a full sheet whose links land on the
 * cascade.
 *
 * Reduced motion seats the dot instantly and fades the sheet in place.
 */
export function NavDockPill({
  brand = <span className="font-semibold tracking-tight">Ovenword</span>,
  links = DEFAULT_LINKS,
  cta = "Subscribe",
  onCta,
  activeHref: activeHrefProp,
  className,
}: NavDockPillProps) {
  const motionSafe = useMotionSafe();
  const [open, setOpen] = React.useState(false);
  const [visited, setVisited] = React.useState<string | null>(null);
  const activeHref = visited ?? activeHrefProp ?? links[0]?.href;

  return (
    <div className={cn("pointer-events-none sticky top-4 z-40 flex w-full justify-center px-4", className)}>
      <nav
        aria-label="Primary"
        className="border-hairline bg-surface-1/90 pointer-events-auto flex items-center gap-1 rounded-full border py-1.5 pr-1.5 pl-4 shadow-raised backdrop-blur-md"
      >
        <span className="mr-2 text-sm">{brand}</span>

        <ul className="hidden items-center gap-0.5 md:flex">
          {links.map((link) => {
            const active = link.href === activeHref;
            return (
              <li key={link.href} className="relative">
                <a
                  href={link.href}
                  onClick={() => setVisited(link.href)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative block rounded-full px-3 py-1.5 text-sm transition-colors",
                    active ? "text-ink font-medium" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {link.label}
                  {active && (
                    <motion.span
                      aria-hidden
                      layoutId="dock-pill-dot"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                      className="bg-primary absolute -bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full"
                    />
                  )}
                </a>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={onCta}
          className="bg-primary text-primary-foreground hover:bg-primary/90 ml-1 hidden rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors md:block"
        >
          {cta}
        </button>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-label="Open menu"
          className="text-ink-2 hover:text-ink rounded-full p-2 transition-colors md:hidden"
        >
          <Menu className="size-4" aria-hidden />
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            className="bg-surface-0/95 pointer-events-auto fixed inset-0 z-50 backdrop-blur-md md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: motionSafe ? durations.base : durations.fast,
              ease: easings.enter,
            }}
          >
            <div className="flex items-center justify-between px-6 py-5">
              <span className="text-sm font-semibold">{brand}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="border-hairline text-ink-2 hover:text-ink rounded-2 border p-2 transition-colors"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <RevealStagger className="flex flex-col px-6 pt-6">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => {
                    setVisited(link.href);
                    setOpen(false);
                  }}
                  className="text-ink border-hairline block w-full border-b py-4 text-2xl font-semibold tracking-tight"
                >
                  {link.label}
                </a>
              ))}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCta?.();
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-2 mt-6 block w-full px-4 py-3 text-sm font-semibold transition-colors"
              >
                {cta}
              </button>
            </RevealStagger>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
