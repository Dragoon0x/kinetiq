"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";

import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHandle,
  BottomSheetTitle,
  BottomSheetTrigger,
} from "@/registry/ui/bottom-sheet";
import { GradientDrift } from "@/registry/ui/gradient-drift";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type LaunchChange = {
  kind: "new" | "changed" | "fixed";
  note: string;
  tag?: string;
};

export type AnnounceLaunchSheetProps = {
  eyebrow?: string;
  line?: string;
  version?: string;
  title?: string;
  changes?: LaunchChange[];
  cta?: string;
  onCta?: () => void;
  /** Presents the sheet on arrival instead of waiting for the trigger. @default false */
  defaultOpen?: boolean;
  className?: string;
};

const DEFAULT_CHANGES: LaunchChange[] = [
  {
    kind: "new",
    note: "The morning board now holds three days of berths at once",
    tag: "board",
  },
  {
    kind: "changed",
    note: "Tide overlays redraw as you pan, not on release",
    tag: "tides",
  },
  {
    kind: "fixed",
    note: "Night mode no longer washes out the low-water line",
    tag: "render",
  },
];

const KIND_LABEL: Record<LaunchChange["kind"], string> = {
  new: "New",
  changed: "Changed",
  fixed: "Fixed",
};

const KIND_VARIANT: Record<LaunchChange["kind"], "info" | "warn" | "success"> =
  {
    new: "info",
    changed: "warn",
    fixed: "success",
  };

/**
 * The library's bottom-sheet doing announcement duty. A notice fits a strip
 * because it interrupts nothing; a launch carries enough — new work, changed
 * defaults, a fix worth naming — that it earns the weight of a sheet the
 * reader has to choose to raise. The band at rest names the release in one
 * line beside a mono version mark; the trigger rises a sheet whose header is
 * a drifting gradient field carrying the version and title, then three
 * what-changed rows, then a primary read-on action beside a quieter later.
 * The sheet is portalled and rises over the page, so the band reserves no
 * room while it is closed and the note
 * reads as part of the page it belongs to; dismiss it once and the band
 * remembers, swapping its trigger to "read it again" behind a seen seal.
 * Reduced motion: the bottom-sheet's own fallback governs the rise and
 * dismiss (see bottom-sheet.tsx); the gradient header holds a fixed,
 * composed arrangement instead of drifting (see gradient-drift.tsx).
 */
export function AnnounceLaunchSheet({
  eyebrow = "Waylight · the morning board",
  line = "r14 is on the board — the quiet release, three weeks of small corrections landing at once.",
  version = "r14",
  title = "The quiet release",
  changes = DEFAULT_CHANGES,
  cta = "Read the full note",
  onCta,
  defaultOpen = false,
  className,
}: AnnounceLaunchSheetProps) {
  const headingId = React.useId();
  // Seeded once from defaultOpen, never re-synced from a prop — the sheet is
  // controlled from here on so the "later" action inside the content can
  // close it (bottom-sheet.tsx exposes no close primitive beyond the
  // trigger, the backdrop, and Escape).
  const [open, setOpen] = React.useState(defaultOpen);
  const [seen, setSeen] = React.useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSeen(true);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "relative border-y border-hairline bg-surface-0",
        className,
      )}
    >
      <BottomSheet
        open={open}
        onOpenChange={handleOpenChange}
        snapPoints={[0.92]}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-4 px-6 py-8">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-label text-ink-3">{eyebrow}</p>
              {seen && <StatusSeal variant="success">seen</StatusSeal>}
            </div>
            <h2
              id={headingId}
              className="max-w-xl text-base leading-relaxed font-medium text-ink sm:text-lg"
            >
              {line}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="font-mono text-xs tracking-[0.08em] text-ink-3 uppercase">
              {version}
            </span>
            {/* PressureButton has no asChild, and BottomSheetTrigger is the
                only thing that can open this sheet — so the trigger is
                styled to read like a button rather than composed as one. */}
            <BottomSheetTrigger
              className={cn(
                "inline-flex items-center gap-2 rounded-2 border border-border px-4 py-2 text-sm font-medium whitespace-nowrap text-ink transition-colors",
                "hover:bg-accent focus-visible:ring-2 focus-visible:ring-cobalt-bright/40 focus-visible:outline-none",
              )}
            >
              {seen ? "read it again" : "open the note"}
              <ArrowRight className="size-3.5" aria-hidden />
            </BottomSheetTrigger>
          </div>
        </div>

        {/*
          The sheet is portalled to the document body and rises over the
          page, so the band above reserves nothing: a launch note that kept
          thirty rem of blank stage below it while closed would read as a
          broken section, and the whole point of choosing a sheet over a
          strip is that the note takes room only when the reader asks for it.
        */}
        <BottomSheetContent>
          <BottomSheetHandle className="shrink-0" />

          <GradientDrift height={168} className="-mx-5 shrink-0">
            <div className="flex h-full flex-col justify-end gap-1 px-5 pb-5">
              <span
                aria-hidden
                className="font-mono text-4xl font-semibold tracking-tight text-ink sm:text-5xl"
              >
                {version}
              </span>
              <BottomSheetTitle className="text-xl sm:text-2xl">
                {title}
              </BottomSheetTitle>
            </div>
          </GradientDrift>

          <ul className="mt-5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {changes.map((change) => (
              <li
                key={`${change.kind}-${change.note}`}
                className="flex items-start gap-3"
              >
                <StatusSeal
                  variant={KIND_VARIANT[change.kind]}
                  className="mt-0.5 shrink-0"
                >
                  {KIND_LABEL[change.kind]}
                </StatusSeal>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-ink-2">
                    {change.note}
                  </p>
                  {change.tag && (
                    <p className="mt-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      {change.tag}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex shrink-0 items-center justify-between gap-4 border-t border-hairline pt-5">
            <PressureButton onClick={onCta}>{cta}</PressureButton>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="text-sm font-medium text-ink-3 transition-colors hover:text-ink"
            >
              later
            </button>
          </div>
        </BottomSheetContent>
      </BottomSheet>
    </section>
  );
}
