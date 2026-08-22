"use client";

import * as React from "react";

import { Menu, X } from "lucide-react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Slipstream, SlipstreamItem } from "@/registry/ui/slipstream";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/registry/lib/utils";

export type RailLink = { label: string; href: string };

export type NavGlassRailProps = {
  brand?: React.ReactNode;
  links?: RailLink[];
  cta?: string;
  onCta?: () => void;
  /** Marks the current page; matched against `href`. */
  activeHref?: string;
  className?: string;
};

const DEFAULT_LINKS: RailLink[] = [
  { label: "Product", href: "#product" },
  { label: "Method", href: "#method" },
  { label: "Customers", href: "#customers" },
  { label: "Pricing", href: "#pricing" },
];

/**
 * A glass rail that condenses as the page gets underway: at the top it sits
 * tall and transparent; once the page scrolls it tightens and takes a blur
 * and a hairline, so the header earns its keep only when content is under
 * it. Desktop links share one slipstream pill that chases hover and focus;
 * the mobile fold glides open below the rail and the icon swaps in place.
 *
 * Reduced motion swaps the condensing and the fold for instant states — the
 * pill parks and the fold appears in place.
 */
export function NavGlassRail({
  brand = (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <span
        aria-hidden
        className="bg-primary text-primary-foreground rounded-1 flex size-6 items-center justify-center font-mono text-[11px]"
      >
        F
      </span>
      Fieldline
    </span>
  ),
  links = DEFAULT_LINKS,
  cta = "Open a bench",
  onCta,
  activeHref,
  className,
}: NavGlassRailProps) {
  const motionSafe = useMotionSafe();
  const [condensed, setCondensed] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full transition-all",
        condensed
          ? "border-hairline bg-surface-0/80 border-b backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
        className,
      )}
      style={{ transitionDuration: `${durations.base}s` }}
    >
      <nav
        aria-label="Primary"
        className={cn(
          "mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 transition-all",
          condensed ? "py-2.5" : "py-4",
        )}
        style={{ transitionDuration: `${durations.base}s` }}
      >
        {brand}

        <Slipstream radius={8} className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <SlipstreamItem key={link.href}>
              <a
                href={link.href}
                aria-current={link.href === activeHref ? "page" : undefined}
                className={cn(
                  "rounded-2 block px-3 py-1.5 text-sm transition-colors",
                  link.href === activeHref
                    ? "text-ink font-medium"
                    : "text-ink-2 hover:text-ink",
                )}
              >
                {link.label}
              </a>
            </SlipstreamItem>
          ))}
        </Slipstream>

        <div className="flex items-center gap-2">
          <PressureButton size="sm" onClick={onCta} className="hidden md:inline-flex">
            {cta}
          </PressureButton>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="glass-rail-fold"
            aria-label={open ? "Close menu" : "Open menu"}
            className="border-hairline text-ink-2 hover:text-ink rounded-2 border p-2 transition-colors md:hidden"
          >
            {open ? (
              <X className="size-4" aria-hidden />
            ) : (
              <Menu className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </nav>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="glass-rail-fold"
            className="border-hairline bg-surface-0/95 overflow-hidden border-t backdrop-blur-md md:hidden"
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
                    aria-current={link.href === activeHref ? "page" : undefined}
                    className="text-ink-2 hover:text-ink block py-2.5 text-sm transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
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
