"use client";

import * as React from "react";

import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AtlasEntry = {
  label: string;
  href: string;
  detail: string;
};

export type NavAtlasPanelProps = {
  brand?: React.ReactNode;
  /** The panel's grouped entries. */
  panelLabel?: string;
  panelGroups?: { heading: string; entries: AtlasEntry[] }[];
  /** The panel's closing feature line. */
  panelNote?: { title: string; copy: string; href: string };
  /** Plain links beside the panel trigger. */
  links?: { label: string; href: string }[];
  cta?: string;
  onCta?: () => void;
  className?: string;
};

const DEFAULT_GROUPS = [
  {
    heading: "PLAN",
    entries: [
      { label: "The morning board", href: "#board", detail: "Every crew, every slot, one surface" },
      { label: "Handoffs", href: "#handoffs", detail: "Rows both crews can point at" },
    ],
  },
  {
    heading: "RECORD",
    entries: [
      { label: "The run ledger", href: "#ledger", detail: "History that answers audits" },
      { label: "Exports", href: "#exports", detail: "Lineage travels with every file" },
    ],
  },
];

const DEFAULT_NOTE = {
  title: "New: the week writes its own review",
  copy: "Friday summaries assembled from the ledger, not memory.",
  href: "#review",
};

/**
 * A navbar with an atlas: one trigger opens a full-width panel below the bar
 * — grouped destinations with a detail line each, and a closing note for the
 * thing worth announcing. The panel glides open on the same height motion as
 * a fold, closes on escape or any exit, and holds the trigger expanded state
 * honestly. Small screens get the whole atlas as a plain stacked fold.
 */
export function NavAtlasPanel({
  brand = <span className="font-semibold tracking-tight">Waylight</span>,
  panelLabel = "Product",
  panelGroups = DEFAULT_GROUPS,
  panelNote = DEFAULT_NOTE,
  links = [
    { label: "Customers", href: "#customers" },
    { label: "Pricing", href: "#pricing" },
  ],
  cta = "Start planning",
  onCta,
  className,
}: NavAtlasPanelProps) {
  const motionSafe = useMotionSafe();
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [foldOpen, setFoldOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLElement | null>(null);

  // Escape and outside-click both close the atlas.
  React.useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelOpen(false);
    };
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [panelOpen]);

  const atlas = (
    <div className="grid gap-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="grid gap-6 sm:grid-cols-2">
        {panelGroups.map((group) => (
          <div key={group.heading}>
            <p className="text-label text-ink-3">{group.heading}</p>
            <ul className="mt-3 flex flex-col gap-1">
              {group.entries.map((entry) => (
                <li key={entry.href}>
                  <a
                    href={entry.href}
                    onClick={() => {
                      setPanelOpen(false);
                      setFoldOpen(false);
                    }}
                    className="hover:bg-surface-1 rounded-2 block px-3 py-2 transition-colors"
                  >
                    <span className="text-ink block text-sm font-medium">
                      {entry.label}
                    </span>
                    <span className="text-ink-3 mt-0.5 block text-xs">
                      {entry.detail}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <a
        href={panelNote.href}
        onClick={() => {
          setPanelOpen(false);
          setFoldOpen(false);
        }}
        className="border-hairline bg-surface-1 hover:border-hairline-strong rounded-3 flex flex-col justify-between gap-4 border p-5 transition-colors"
      >
        <div>
          <p className="text-ink font-medium">{panelNote.title}</p>
          <p className="text-ink-3 mt-1.5 text-sm leading-relaxed">
            {panelNote.copy}
          </p>
        </div>
        <span className="text-ink-2 inline-flex items-center gap-1.5 text-sm">
          See it
          <ArrowRight className="size-3.5" aria-hidden />
        </span>
      </a>
    </div>
  );

  return (
    <header
      ref={rootRef}
      className={cn("bg-surface-0 border-hairline relative w-full border-b", className)}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-3.5"
      >
        {brand}

        <div className="hidden items-center gap-1 md:flex">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
            aria-controls="atlas-panel"
            className={cn(
              "rounded-2 flex items-center gap-1 px-3 py-1.5 text-sm transition-colors",
              panelOpen ? "bg-surface-1 text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {panelLabel}
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                panelOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-ink-2 hover:text-ink rounded-2 px-3 py-1.5 text-sm transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <PressureButton size="sm" onClick={onCta} className="hidden md:inline-flex">
            {cta}
          </PressureButton>
          <button
            type="button"
            onClick={() => setFoldOpen((v) => !v)}
            aria-expanded={foldOpen}
            aria-label={foldOpen ? "Close menu" : "Open menu"}
            className="border-hairline text-ink-2 hover:text-ink rounded-2 border p-2 transition-colors md:hidden"
          >
            {foldOpen ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
          </button>
        </div>
      </nav>

      {/* The atlas, full width under the bar. */}
      <AnimatePresence initial={false}>
        {panelOpen && (
          <motion.div
            id="atlas-panel"
            className="border-hairline bg-surface-0 absolute inset-x-0 top-full z-40 hidden overflow-hidden border-b shadow-raised md:block"
            initial={motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.move }
                : { duration: durations.fast }
            }
          >
            <div className="mx-auto w-full max-w-7xl px-6 py-8">{atlas}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Small screens: the whole atlas as a stacked fold. */}
      <AnimatePresence initial={false}>
        {foldOpen && (
          <motion.div
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
            <div className="px-6 py-4">
              {atlas}
              <div className="mt-4">
                <PressureButton size="sm" onClick={onCta} className="w-full">
                  {cta}
                </PressureButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
