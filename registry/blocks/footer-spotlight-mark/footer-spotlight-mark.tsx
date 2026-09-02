"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SpotlightLink = { label: string; href: string };

export type SpotlightColumn = { heading: string; links: SpotlightLink[] };

export type FooterSpotlightMarkProps = {
  brand?: string;
  /** The giant word. Defaults to `brand`. */
  mark?: string;
  tagline?: string;
  status?: string;
  columns?: SpotlightColumn[];
  fineprint?: string;
  /** Spotlight radius in px. @default 160 */
  radius?: number;
  className?: string;
};

const DEFAULT_COLUMNS: SpotlightColumn[] = [
  {
    heading: "OPERATIONS",
    links: [
      { label: "Morning board", href: "#morning-board" },
      { label: "Berth ledger", href: "#berth-ledger" },
      { label: "Tide log", href: "#tide-log" },
      { label: "Dispatch", href: "#dispatch" },
    ],
  },
  {
    heading: "COMPANY",
    links: [
      { label: "About the yard", href: "#about" },
      { label: "Journal", href: "#journal" },
      { label: "Careers", href: "#careers" },
      { label: "Contact", href: "#contact" },
    ],
  },
  {
    heading: "SUPPORT",
    links: [
      { label: "Documentation", href: "#docs" },
      { label: "Changelog", href: "#changelog" },
      { label: "Status", href: "#status" },
      { label: "Field guides", href: "#guides" },
    ],
  },
];

/**
 * A closing footer built around a giant outlined wordmark: hollow by default,
 * stroked rather than filled, so the mark reads as a watermark until a
 * cursor-following spotlight fills it in. The spotlight is cursor-lens's
 * two-motion-value, clip-path-follows-pointer idiom reimplemented locally
 * against a stacked pair of text layers rather than that component wrapping
 * the mark — the centre retargets on a snap spring per pointer move and the
 * radius glides open on entry and recoils shut on leave, so the fill always
 * trails the point of contact instead of jumping to it. The brand column and
 * link lines above carry the actual navigation and identity; the mark row
 * itself is decorative and hidden from assistive tech. Reduced motion:
 * the spotlight never engages — the mark renders solid at low opacity, no
 * clip and no pointer handling, identical on server and first client render.
 */
export function FooterSpotlightMark({
  brand = "Waylight",
  mark,
  tagline = "Harbour operations, run in the open — boards, berths, and a ledger everyone can read.",
  status = "All systems steady",
  columns = DEFAULT_COLUMNS,
  fineprint = "© 2026 Waylight Harbour Co.",
  radius = 160,
  className,
}: FooterSpotlightMarkProps) {
  const word = mark ?? brand;
  const motionSafe = useMotionSafe();
  const markRef = React.useRef<HTMLDivElement>(null);

  const x = useMotionValue<number>(0);
  const y = useMotionValue<number>(0);
  const r = useMotionValue<number>(0);

  const clip = useTransform(
    [x, y, r],
    ([cx, cy, cr]: number[]) => `circle(${cr}px at ${cx}px ${cy}px)`,
  );

  const focus = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe) return;
    const rect = markRef.current?.getBoundingClientRect();
    if (!rect) return;
    animate(x, event.clientX - rect.left, springs.snap);
    animate(y, event.clientY - rect.top, springs.snap);
  };

  const open = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe) return;
    focus(event);
    animate(r, radius, springs.glide);
  };

  const close = () => {
    if (!motionSafe) return;
    animate(r, 0, springs.recoil);
  };

  return (
    <footer className={cn("border-t border-hairline bg-surface-0", className)}>
      <div className="mx-auto w-full max-w-7xl px-6 pt-14 pb-10">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <div className="max-w-sm">
            <span className="text-lg font-semibold tracking-tight">
              {brand}
            </span>
            <p className="mt-3 text-sm leading-relaxed text-ink-3">{tagline}</p>
            <p className="mt-4 font-mono text-xs tracking-[0.08em] text-ink-3 uppercase">
              {status}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <nav key={column.heading} aria-label={column.heading}>
                <p className="text-label text-ink-3">{column.heading}</p>
                <ul className="mt-3 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className="text-sm text-ink-2 transition-colors hover:text-ink"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-hairline" />

      <div
        ref={markRef}
        aria-hidden
        onPointerEnter={open}
        onPointerMove={focus}
        onPointerLeave={close}
        onPointerDown={open}
        onPointerUp={close}
        className="relative w-full touch-none overflow-hidden py-6 select-none"
      >
        <span
          style={{
            color: "transparent",
            WebkitTextStroke: "1px var(--ink-3)",
          }}
          className="block text-[clamp(4rem,18vw,14rem)] leading-none font-bold tracking-tight"
        >
          {word}
        </span>
        <motion.span
          style={{
            clipPath: motionSafe ? clip : "none",
            opacity: motionSafe ? 1 : 0.18,
          }}
          className="pointer-events-none absolute inset-0 block text-[clamp(4rem,18vw,14rem)] leading-none font-bold tracking-tight text-ink"
        >
          {word}
        </motion.span>
      </div>

      <div className="border-t border-hairline">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-ink-3">
          <span className="font-mono tracking-[0.08em] uppercase">
            {fineprint}
          </span>
          <nav aria-label="Legal">
            <ul className="flex gap-5">
              <li>
                <a href="#privacy" className="transition-colors hover:text-ink">
                  Privacy
                </a>
              </li>
              <li>
                <a href="#terms" className="transition-colors hover:text-ink">
                  Terms
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
