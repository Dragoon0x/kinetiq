"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import { ArrowLeftRight, FileQuestionMark, RotateCcw, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type LockstepSide = "left" | "right";

export type LockstepSection = {
  /** Pairs the section with its counterpart: same anchor, same section. */
  anchor: string;
  heading: string;
  /** Paragraphs, in order. */
  body: string[];
};

export type LockstepDocument = {
  id: string;
  /** Short version label, "v3". */
  version: string;
  title: string;
  /** One line under the title, "Signed 14 Mar 2025". */
  meta: string;
  /** Who the document is between, printed under its title. */
  parties?: string;
  sections: LockstepSection[];
};

/** The older document first, the newer second; either may be missing. */
export type LockstepPair = [LockstepDocument | null, LockstepDocument | null];

export type LockstepAnchor = { id: string; label: string };

export type LockstepStatus = "ready" | "loading" | "error";

export type LockstepPanesProps = {
  /** The two documents, older first. A null side shows the missing-document state. @default defaultLockstepDocuments */
  documents?: LockstepPair;
  /** The matched sections in reading order, with the short names the section strip uses. @default defaultLockstepAnchors */
  anchors?: LockstepAnchor[];
  /** Controlled lock: the panes scroll as one. */
  locked?: boolean;
  /** Initial lock when uncontrolled. @default true */
  defaultLocked?: boolean;
  /** Fires from the switch or the shortcut that changed the lock. */
  onLockChange?: (locked: boolean) => void;
  /** Fires when the panes trade places, with the documents in their new left-to-right order. */
  onSwap?: (documents: LockstepPair) => void;
  /** A pane's close button was pressed; the pane shows its closed state until reopened. */
  onClosePane?: (side: LockstepSide, document: LockstepDocument) => void;
  /** A closed pane's "Reopen" was pressed; the document is back in the pane. */
  onReopenPane?: (side: LockstepSide, document: LockstepDocument) => void;
  /** The missing-document state's "Choose version" was pressed. Without it the button is not drawn. */
  onPickDocument?: (side: LockstepSide) => void;
  /** Fires when the section at the reading line of the leading pane changes. */
  onSectionChange?: (anchor: string) => void;
  /** Fill strength of the bands across the gutter, 0 to 1; their edges draw a little stronger. @default 0.35 */
  bandOpacity?: number;
  /** Width of the gutter the bands cross, px. @default 48 */
  gutter?: number;
  /** Changed and new marks, changed bands, the lock and the strip pill — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Where in a pane matched sections line up while locked, as a fraction of its height. @default 0.25 */
  readingLine?: number;
  /** Mark changed, new and dropped sections with tags, edge markers and accent bands. @default true */
  showChanges?: boolean;
  /** Whether the documents have arrived. @default "ready" */
  status?: LockstepStatus;
  /** "Try again" was pressed after the documents failed to load. */
  onRetry?: () => void;
  /** The frame's title. @default "Compare versions" */
  title?: string;
  /** One line under the title. @default "Fieldline · Services agreement" */
  subtitle?: string;
  /** The frame's height, px; the panes scroll inside it. @default 520 */
  height?: number;
  /** Classes for the outer frame. */
  className?: string;
};

type Change = "same" | "changed" | "added" | "removed";

type Geo = {
  /** Each section's top and height inside its scroll content. */
  tops: Record<string, { top: number; height: number }>;
  /** Scroll content height. */
  total: number;
  /** Scroll viewport height. */
  view: number;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultLockstepAnchors: LockstepAnchor[] = [
  { id: "scope", label: "Scope" },
  { id: "fees", label: "Fees" },
  { id: "levels", label: "Service levels" },
  { id: "term", label: "Term" },
  { id: "data", label: "Data" },
  { id: "subprocessors", label: "Subprocessors" },
  { id: "liability", label: "Liability" },
  { id: "exclusivity", label: "Exclusivity" },
  { id: "termination", label: "Termination" },
];

const PARTIES = "Fieldline Ltd and Basinworks Logistics Ltd";

const SCOPE = [
  "Fieldline provides route planning, dispatch and proof-of-delivery software to the Customer’s depots named in Schedule A, with onboarding for up to forty drivers and two dispatch leads.",
  "Changes to the depots or to the number of drivers are agreed in writing and priced under the fees section.",
];
const TERM = [
  "This agreement runs for twelve months from the start date and renews for further twelve-month terms unless either party gives sixty days’ notice before a renewal date.",
];
const TERMINATION = [
  "Either party may end this agreement on thirty days’ written notice if the other materially breaches it and does not put the breach right within that period.",
  "On ending, Fieldline exports the Customer’s route history in an open format within ten working days.",
];

export const defaultLockstepDocuments: LockstepPair = [
  {
    id: "msa-v2",
    version: "v2",
    title: "Services agreement",
    meta: "Signed 14 Mar 2025",
    parties: PARTIES,
    sections: [
      { anchor: "scope", heading: "Scope of services", body: SCOPE },
      {
        anchor: "fees",
        heading: "Fees and invoicing",
        body: [
          "Fees are charged per active vehicle per month at the rates in Schedule B. Fieldline invoices monthly in arrears and the Customer pays within 30 days of the invoice date.",
        ],
      },
      {
        anchor: "levels",
        heading: "Service levels",
        body: [
          "The platform is available 99.5% of each calendar month, excluding scheduled maintenance announced 48 hours ahead.",
          "If availability falls below that, the Customer receives a credit of 5% of that month’s fees.",
        ],
      },
      { anchor: "term", heading: "Term and renewal", body: TERM },
      {
        anchor: "data",
        heading: "Data handling",
        body: [
          "Fieldline processes route, vehicle and driver data only to provide the services. Data is stored in the United Kingdom and deleted within 90 days of the agreement ending.",
        ],
      },
      {
        anchor: "liability",
        heading: "Liability",
        body: [
          "Each party’s total liability in any year is limited to the fees paid in the twelve months before the claim. Neither party is liable for indirect or consequential loss.",
        ],
      },
      {
        anchor: "exclusivity",
        heading: "Exclusivity",
        body: [
          "During the term the Customer will not use another routing or dispatch platform at the depots in Schedule A without Fieldline’s written consent.",
          "This does not cover depots the Customer opens or acquires after the start date.",
        ],
      },
      { anchor: "termination", heading: "Termination", body: TERMINATION },
    ],
  },
  {
    id: "msa-v3",
    version: "v3",
    title: "Services agreement",
    meta: "Draft · edited 2 Sep 2026",
    parties: PARTIES,
    sections: [
      { anchor: "scope", heading: "Scope of services", body: SCOPE },
      {
        anchor: "fees",
        heading: "Fees and invoicing",
        body: [
          "Fees are charged per active vehicle per month at the rates in Schedule B, reviewed once a year in line with the published freight index. Fieldline invoices monthly in arrears and the Customer pays within 45 days of the invoice date.",
          "Disputed amounts are raised within 15 days of the invoice; the undisputed balance stays payable on time.",
        ],
      },
      {
        anchor: "levels",
        heading: "Service levels",
        body: [
          "The platform is available 99.9% of each calendar month, excluding maintenance announced 72 hours ahead and held outside 06:00–20:00 local time.",
          "Below 99.9% the Customer receives a credit of 5% of that month’s fees; below 99% the credit rises to 15%.",
          "Three missed months in a row let the Customer end the agreement without charge.",
        ],
      },
      { anchor: "term", heading: "Term and renewal", body: TERM },
      {
        anchor: "data",
        heading: "Data handling",
        body: [
          "Fieldline processes route, vehicle and driver data only to provide the services. Data is stored in the United Kingdom or the European Economic Area and deleted within 30 days of the agreement ending, with a deletion certificate on request.",
        ],
      },
      {
        anchor: "subprocessors",
        heading: "Subprocessors",
        body: [
          "Fieldline lists its subprocessors in Schedule D and gives 30 days’ notice before adding one.",
          "The Customer may object on reasonable data-protection grounds, and the parties will discuss alternatives in good faith.",
        ],
      },
      {
        anchor: "liability",
        heading: "Liability",
        body: [
          "Each party’s total liability in any year is limited to one and a half times the fees paid in the twelve months before the claim, except for breaches of the data handling section, which are capped at £2,000,000.",
          "Neither party is liable for indirect or consequential loss.",
        ],
      },
      { anchor: "termination", heading: "Termination", body: TERMINATION },
    ],
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_INSET =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Narrower than the phone breakpoint (30rem), read from the frame itself. */
function useNarrow(node: HTMLElement | null) {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      setNarrow(node.getBoundingClientRect().width < 480),
    );
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return narrow;
}

/**
 * Locked scrolling is piecewise linear between the tops of the matched
 * sections, read at the reading line. Where one version spends more words on a
 * section its pane runs faster through it; where a section exists on one side
 * only, the other waits. That difference in rate is what bends the bands.
 */
function keypoints(
  lead: Geo,
  follow: Geo,
  shared: string[],
  line: number,
): [number, number][] {
  const maxL = Math.max(0, lead.total - lead.view);
  const maxF = Math.max(0, follow.total - follow.view);
  const points: [number, number][] = [[line, line]];
  for (const id of shared) {
    const a = lead.tops[id];
    const b = follow.tops[id];
    const last = points[points.length - 1];
    if (!a || !b || !last) continue;
    if (
      a.top > last[0] &&
      b.top > last[1] &&
      a.top < maxL + line &&
      b.top < maxF + line
    ) {
      points.push([a.top, b.top]);
    }
  }
  const last = points[points.length - 1];
  const end: [number, number] = [maxL + line, maxF + line];
  if (last && end[0] > last[0] && end[1] >= last[1]) points.push(end);
  return points;
}

function mapThrough(points: [number, number][], p: number): number {
  const first = points[0];
  if (!first) return p;
  if (p <= first[0]) return first[1] + (p - first[0]);
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    if (p <= b[0]) {
      const span = b[0] - a[0];
      return span <= 0 ? b[1] : a[1] + ((p - a[0]) / span) * (b[1] - a[1]);
    }
  }
  const last = points[points.length - 1] ?? first;
  return last[1] + (p - last[0]);
}

const sameGeo = (a: Geo | null, b: Geo | null) => {
  if (!a || !b) return a === b;
  if (a.total !== b.total || a.view !== b.view) return false;
  const ka = Object.keys(a.tops);
  if (ka.length !== Object.keys(b.tops).length) return false;
  return ka.every(
    (k) =>
      a.tops[k]?.top === b.tops[k]?.top &&
      a.tops[k]?.height === b.tops[k]?.height,
  );
};

/* ----------------------------------------------------------------------- */
/*                                 Padlock                                  */
/* ----------------------------------------------------------------------- */

/**
 * The shackle is its own path, lifted and swung about its right leg on
 * `snap`: the one crisp overshoot is the click of the lock.
 */
function Padlock({
  locked,
  motionSafe,
}: {
  locked: boolean;
  motionSafe: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 shrink-0 overflow-visible"
    >
      <motion.path
        d="M5.25 8V5.25a2.75 2.75 0 0 1 5.5 0V8"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        initial={false}
        animate={{ y: locked ? 0 : -2.25, rotate: locked ? 0 : 22 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
        style={{ originX: 1, originY: 1 }}
      />
      <rect
        x={3}
        y={7.25}
        width={10}
        height={7.5}
        rx={1.75}
        fill="currentColor"
      />
      <circle cx={8} cy={10.9} r={1.1} className="fill-card" />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  A pane                                  */
/* ----------------------------------------------------------------------- */

type PaneProps = {
  uid: string;
  slot: 0 | 1;
  side: LockstepSide;
  doc: LockstepDocument | null;
  /** The document this pane held before it was closed. */
  closedDoc: LockstepDocument | null;
  status: LockstepStatus;
  changes: Record<string, Change>;
  otherVersion: string | null;
  showChanges: boolean;
  hot: string | null;
  /** Bumps when this pane becomes the shown tab; the sign is the direction. */
  enter: { n: number; dir: number };
  motionSafe: boolean;
  onHot: (anchor: string | null) => void;
  onScroll: () => void;
  onLead: () => void;
  onClose: () => void;
  onReopen: () => void;
  onPick?: () => void;
  onRetry?: () => void;
  scrollerRef: (node: HTMLDivElement | null) => void;
  articleRef: (node: HTMLElement | null) => void;
  sectionRef: (anchor: string) => (node: HTMLElement | null) => void;
};

function Pane({
  uid,
  slot,
  side,
  doc,
  closedDoc,
  status,
  changes,
  otherVersion,
  showChanges,
  hot,
  enter,
  motionSafe,
  onHot,
  onScroll,
  onLead,
  onClose,
  onReopen,
  onPick,
  onRetry,
  scrollerRef,
  articleRef,
  sectionRef,
}: PaneProps) {
  const x = useMotionValue(0);
  const opacity = useMotionValue(1);

  // A tab coming forward on a phone slides the last few pixels in from the
  // side it came from on `snap` and fades up; the one leaving simply hides.
  React.useEffect(() => {
    if (enter.n === 0) return;
    if (!motionSafe) {
      x.jump(0);
      opacity.jump(0);
      const fade = animate(opacity, 1, { duration: durations.fast });
      return () => {
        fade.stop();
        opacity.jump(1);
      };
    }
    x.jump(enter.dir * distances.shift);
    opacity.jump(0);
    const runs = [
      animate(x, 0, springs.snap),
      animate(opacity, 1, { duration: durations.base, ease: easings.enter }),
    ];
    return () => {
      for (const run of runs) run.stop();
      x.jump(0);
      opacity.jump(1);
    };
  }, [enter, motionSafe, opacity, x]);

  const gutterEdge =
    side === "left"
      ? "left-0 @min-[30rem]/lockstep-panes:right-0 @min-[30rem]/lockstep-panes:left-auto"
      : "left-0";

  const label = doc
    ? `${doc.version}, ${doc.title}, ${doc.meta}`
    : closedDoc
      ? `${closedDoc.version}, closed`
      : `${side === "left" ? "Left" : "Right"} pane, no document`;

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-hidden className="flex flex-col gap-3 px-4 py-4">
        <span className="h-4 w-2/3 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
        <span className="h-3 w-1/2 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="flex flex-col gap-1.5 pt-2">
            <span className="h-3 w-2/5 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
            <span className="h-2.5 w-full rounded-1 bg-surface-2 motion-safe:animate-pulse" />
            <span className="h-2.5 w-11/12 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
            <span className="h-2.5 w-3/5 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
          </span>
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-2 px-6 text-center">
        <p className="text-[13px] font-medium text-foreground">
          This version could not be opened.
        </p>
        <p className="text-[12px] leading-[1.5] text-ink-3">
          The file store did not answer. Nothing was changed.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else if (!doc) {
    body = (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-2 px-6 text-center">
        <span className="mb-1 inline-flex size-10 items-center justify-center rounded-full border border-dashed border-hairline-strong text-ink-3">
          <FileQuestionMark aria-hidden className="size-4.5" />
        </span>
        <p className="text-[13px] font-medium text-foreground">
          {closedDoc ? `${closedDoc.version} is closed` : "Nothing to compare"}
        </p>
        <p className="max-w-56 text-[12px] leading-[1.5] text-ink-3">
          {closedDoc
            ? "Reopen it to read the two versions side by side again."
            : "Choose a version of the agreement to read beside this one."}
        </p>
        {closedDoc ? (
          <button
            type="button"
            onClick={onReopen}
            className={cn(
              "mt-1 inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            {`Reopen ${closedDoc.version}`}
          </button>
        ) : onPick ? (
          <button
            type="button"
            onClick={onPick}
            className={cn(
              "mt-1 inline-flex h-8 items-center rounded-2 bg-(--lp-solid) px-3 text-[12px] font-medium text-(--lp-on) transition-colors hover:bg-[color-mix(in_oklab,var(--lp-solid)_88%,black)]",
              FOCUS,
            )}
          >
            Choose version
          </button>
        ) : null}
      </div>
    );
  } else {
    body = (
      <article ref={articleRef} className="pb-6">
        <header className="px-4 pt-4 pb-2">
          <h3 className="text-[15px] leading-5 font-semibold text-foreground">
            {doc.title}
          </h3>
          {doc.parties ? (
            <p className="mt-0.5 text-[11.5px] leading-4 text-ink-3">
              {doc.parties}
            </p>
          ) : null}
        </header>
        {doc.sections.map((section, i) => {
          const change = showChanges
            ? (changes[section.anchor] ?? "same")
            : "same";
          const tag =
            change === "changed"
              ? "Changed"
              : change === "added"
                ? "New"
                : change === "removed"
                  ? otherVersion
                    ? `Not in ${otherVersion}`
                    : "Dropped"
                  : null;
          return (
            <section
              key={section.anchor}
              ref={sectionRef(section.anchor)}
              data-lp-anchor={section.anchor}
              onPointerEnter={() => onHot(section.anchor)}
              onPointerLeave={() => onHot(null)}
              className={cn(
                "relative px-4 py-2.5 transition-colors duration-150",
                hot === section.anchor && "bg-(--lp-wash)",
              )}
            >
              {change === "changed" || change === "added" ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-2 w-0.5 rounded-full bg-(--lp-accent)",
                    gutterEdge,
                  )}
                />
              ) : change === "removed" ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-2 w-0 border-l-2 border-dashed border-ink-3",
                    gutterEdge,
                  )}
                />
              ) : null}
              <h4 className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-5 font-semibold text-foreground">
                <span>{`${i + 1}. ${section.heading}`}</span>
                {tag ? (
                  <span
                    className={cn(
                      "font-mono text-[9.5px] leading-4 font-medium tracking-[0.08em] uppercase",
                      change === "removed"
                        ? "text-ink-3"
                        : "text-(--lp-accent)",
                    )}
                  >
                    {tag}
                  </span>
                ) : null}
              </h4>
              <div className="mt-1 flex flex-col gap-1.5">
                {section.body.map((p, j) => (
                  <p key={j} className="text-[13px] leading-[1.55] text-ink-2">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          );
        })}
      </article>
    );
  }

  return (
    <motion.div
      className="flex h-full flex-col overflow-hidden"
      style={{ x, opacity }}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline bg-surface-1 pr-1.5 pl-3">
        {status === "loading" ? (
          <span
            aria-hidden
            className="h-4 w-32 rounded-1 bg-surface-2 motion-safe:animate-pulse"
          />
        ) : (
          <>
            <span
              className={cn(
                "inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 font-mono text-[10.5px] leading-none",
                doc && slot === 1
                  ? "border-(--lp-line) text-(--lp-accent)"
                  : "border-hairline text-ink-2",
              )}
            >
              {doc?.version ?? closedDoc?.version ?? "—"}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                title={doc?.title}
                className="truncate text-[12.5px] leading-4 font-medium text-foreground"
              >
                {doc?.title ?? closedDoc?.title ?? "No document"}
              </span>
              <span
                title={doc?.meta}
                className="truncate text-[11px] leading-4 text-ink-3"
              >
                {doc?.meta ?? (closedDoc ? "Closed" : "Missing")}
              </span>
            </span>
            {doc ? (
              <button
                type="button"
                aria-label={`Close ${doc.version}`}
                onClick={onClose}
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            ) : null}
          </>
        )}
      </div>
      <div
        ref={scrollerRef}
        id={`${uid}-pane-${slot}`}
        role="region"
        aria-label={label}
        aria-busy={status === "loading" || undefined}
        tabIndex={doc ? 0 : -1}
        onScroll={onScroll}
        onWheel={onLead}
        onPointerDown={onLead}
        onTouchStart={onLead}
        onKeyDown={onLead}
        onFocus={onLead}
        className={cn(
          "relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain bg-card",
          FOCUS_INSET,
        )}
      >
        {body}
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The frame                                 */
/* ----------------------------------------------------------------------- */

/**
 * Two versions of a document side by side. Each pane is a real scroll region;
 * the gutter between them draws one band per matched section, its left edge
 * spanning the section in the left pane and its right edge the same section
 * in the right pane, joined by two curves. Locked, the panes scroll as one —
 * piecewise linear between matched section tops at a reading line, so a pane
 * runs faster through a section its version spent more words on and waits
 * through a section the other version lacks. The bands bend exactly where the
 * documents drift.
 *
 * Locking glides the drifted pane back into alignment on `springs.glide`
 * while the padlock's shackle drops shut on `springs.snap`; unlocking lifts
 * and swings it open and dims the bands, which no longer drive anything. Swap
 * trades the panes on glide. The bands are redrawn straight into the DOM from
 * the scroll events — nothing renders per frame and nothing runs at rest.
 *
 * Cmd or Ctrl+L toggles the lock anywhere inside; Alt with Left or Right moves
 * between panes; the section strip is a roving toolbar that jumps both panes.
 * Under 30rem the panes become tabs with a swap control that keeps your place.
 * Under reduced motion the follower and the jumps land at once and the
 * shackle swaps without travel; the bands still follow the scroll.
 */
export function LockstepPanes({
  documents = defaultLockstepDocuments,
  anchors = defaultLockstepAnchors,
  locked: lockedProp,
  defaultLocked = true,
  onLockChange,
  onSwap,
  onClosePane,
  onReopenPane,
  onPickDocument,
  onSectionChange,
  bandOpacity = 0.35,
  gutter = 48,
  accent = "var(--accent-bright)",
  readingLine = 0.25,
  showChanges = true,
  status = "ready",
  onRetry,
  title = "Compare versions",
  subtitle = "Fieldline · Services agreement",
  height = 520,
  className,
}: LockstepPanesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const [frame, setFrame] = React.useState<HTMLElement | null>(null);
  const narrow = useNarrow(frame);

  /* ------------------------------- order -------------------------------- */

  const keyOf = (i: 0 | 1) => documents[i]?.id ?? `__empty-${i}`;
  const [leftKey, setLeftKey] = React.useState<string>(() => keyOf(0));
  const leftSlot: 0 | 1 = keyOf(1) === leftKey ? 1 : 0;
  const rightSlot: 0 | 1 = leftSlot === 0 ? 1 : 0;
  const slotOf = (side: LockstepSide): 0 | 1 =>
    side === "left" ? leftSlot : rightSlot;
  const sideOf = (slot: 0 | 1): LockstepSide =>
    slot === leftSlot ? "left" : "right";

  const [closed, setClosed] = React.useState<string[]>([]);
  const ready = status === "ready";
  const docAt = (slot: 0 | 1): LockstepDocument | null => {
    const d = documents[slot];
    return ready && d && !closed.includes(d.id) ? d : null;
  };
  const closedAt = (slot: 0 | 1): LockstepDocument | null => {
    const d = documents[slot];
    return d && closed.includes(d.id) ? d : null;
  };
  const docs: [LockstepDocument | null, LockstepDocument | null] = [
    docAt(0),
    docAt(1),
  ];
  const pairComplete = Boolean(docs[0] && docs[1]);

  /* ------------------------------ changes ------------------------------- */

  const changes: Record<string, Change> = {};
  const older = docs[0];
  const newer = docs[1];
  if (older && newer) {
    const byA = new Map(older.sections.map((s) => [s.anchor, s]));
    const byB = new Map(newer.sections.map((s) => [s.anchor, s]));
    for (const [id, a] of byA) {
      const b = byB.get(id);
      changes[id] = !b
        ? "removed"
        : a.heading === b.heading && a.body.join("\n") === b.body.join("\n")
          ? "same"
          : "changed";
    }
    for (const id of byB.keys()) if (!byA.has(id)) changes[id] = "added";
  }
  const counts = { changed: 0, added: 0, removed: 0 };
  for (const c of Object.values(changes)) if (c !== "same") counts[c] += 1;

  const leftDoc = docs[leftSlot];
  const rightDoc = docs[rightSlot];
  const shared =
    leftDoc && rightDoc
      ? leftDoc.sections
          .map((s) => s.anchor)
          .filter((id) => rightDoc.sections.some((s) => s.anchor === id))
      : [];
  const stripAnchors = anchors.filter((a) =>
    docs.some((d) => d?.sections.some((s) => s.anchor === a.id)),
  );

  /* -------------------------------- lock -------------------------------- */

  const [ownLocked, setOwnLocked] = React.useState(defaultLocked);
  const isLocked = lockedProp ?? ownLocked;
  const [announcement, setAnnouncement] = React.useState("");

  const setLock = (next: boolean) => {
    if (!pairComplete) {
      setAnnouncement("Open both versions to lock scrolling.");
      return;
    }
    if (next === isLocked) return;
    if (lockedProp === undefined) setOwnLocked(next);
    onLockChange?.(next);
    setAnnouncement(
      next
        ? "Scrolling locked. The panes move together."
        : "Scrolling unlocked. Each pane moves on its own.",
    );
  };

  /* ------------------------------ geometry ------------------------------ */

  const scrollers = React.useRef<
    [HTMLDivElement | null, HTMLDivElement | null]
  >([null, null]);
  const [scrollNodes, setScrollNodes] = React.useState<
    [HTMLDivElement | null, HTMLDivElement | null]
  >([null, null]);
  const [articleNodes, setArticleNodes] = React.useState<
    [HTMLElement | null, HTMLElement | null]
  >([null, null]);
  const sectionEls = React.useRef(new Map<string, HTMLElement>());
  const bandEls = React.useRef(
    new Map<
      string,
      { fill: SVGPathElement | null; edge: SVGPathElement | null }
    >(),
  );
  const geoRef = React.useRef<[Geo | null, Geo | null]>([null, null]);
  const drawRef = React.useRef<() => void>(() => {});
  const gutterBox = React.useRef<HTMLDivElement | null>(null);

  // Scroll nodes are state so the observer binds when they arrive; handlers
  // read them through a ref kept in step after each commit.
  const setScroller0 = React.useCallback((node: HTMLDivElement | null) => {
    setScrollNodes((prev) => (prev[0] === node ? prev : [node, prev[1]]));
  }, []);
  const setScroller1 = React.useCallback((node: HTMLDivElement | null) => {
    setScrollNodes((prev) => (prev[1] === node ? prev : [prev[0], node]));
  }, []);
  const setArticle0 = React.useCallback((node: HTMLElement | null) => {
    setArticleNodes((prev) => (prev[0] === node ? prev : [node, prev[1]]));
  }, []);
  const setArticle1 = React.useCallback((node: HTMLElement | null) => {
    setArticleNodes((prev) => (prev[1] === node ? prev : [prev[0], node]));
  }, []);
  React.useLayoutEffect(() => {
    scrollers.current = scrollNodes;
  }, [scrollNodes]);
  const sectionRef =
    (slot: 0 | 1) => (anchor: string) => (node: HTMLElement | null) => {
      const key = `${slot}:${anchor}`;
      if (node) sectionEls.current.set(key, node);
      else sectionEls.current.delete(key);
    };
  const bandRef =
    (id: string, part: "fill" | "edge") => (node: SVGPathElement | null) => {
      const entry = bandEls.current.get(id) ?? { fill: null, edge: null };
      entry[part] = node;
      bandEls.current.set(id, entry);
    };

  const measure = React.useCallback(() => {
    const next: [Geo | null, Geo | null] = [null, null];
    for (const slot of [0, 1] as const) {
      const scroller = scrollers.current[slot];
      if (!scroller) continue;
      const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
      const tops: Geo["tops"] = {};
      for (const [key, el] of sectionEls.current) {
        const [s, anchor] = key.split(":");
        if (Number(s) !== slot || !anchor) continue;
        const r = el.getBoundingClientRect();
        tops[anchor] = {
          top: Math.round(r.top - base),
          height: Math.round(r.height),
        };
      }
      next[slot] = {
        tops,
        total: scroller.scrollHeight,
        view: scroller.clientHeight,
      };
    }
    const prev = geoRef.current;
    if (sameGeo(prev[0], next[0]) && sameGeo(prev[1], next[1])) return;
    geoRef.current = next;
    drawRef.current();
  }, []);

  React.useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    for (const node of [...scrollNodes, ...articleNodes]) {
      if (node) ro.observe(node);
    }
    return () => ro.disconnect();
  }, [scrollNodes, articleNodes, measure]);

  const docsKey = `${docs[0]?.id ?? "-"}|${docs[1]?.id ?? "-"}|${showChanges}|${status}`;
  React.useLayoutEffect(() => {
    measure();
  }, [docsKey, narrow, measure]);

  /* ------------------------------- drawing ------------------------------ */

  const lineFor = (g: Geo) => g.view * clamp(readingLine, 0, 0.9);

  const draw = () => {
    const a = scrollers.current[leftSlot];
    const b = scrollers.current[rightSlot];
    const ga = geoRef.current[leftSlot];
    const gb = geoRef.current[rightSlot];
    if (!a || !b || !ga || !gb) return;
    const H = a.clientHeight;
    const G = gutterBox.current?.clientWidth || Math.max(8, gutter);
    const c = r1(G / 2);
    const sa = a.scrollTop;
    const sb = b.scrollTop;
    const fit = (v: number) => r1(clamp(v, -H, 2 * H));
    for (const id of shared) {
      const ra = ga.tops[id];
      const rb = gb.tops[id];
      const els = bandEls.current.get(id);
      if (!ra || !rb || !els) continue;
      // A hair of inset at each end keeps neighbouring bands apart.
      const a1 = fit(ra.top - sa + 2);
      const a2 = fit(ra.top + ra.height - sa - 2);
      const b1 = fit(rb.top - sb + 2);
      const b2 = fit(rb.top + rb.height - sb - 2);
      els.fill?.setAttribute(
        "d",
        `M0 ${a1}C${c} ${a1} ${c} ${b1} ${G} ${b1}L${G} ${b2}C${c} ${b2} ${c} ${a2} 0 ${a2}Z`,
      );
      els.edge?.setAttribute(
        "d",
        `M0 ${a1}C${c} ${a1} ${c} ${b1} ${G} ${b1}M0 ${a2}C${c} ${a2} ${c} ${b2} ${G} ${b2}`,
      );
    }
  };
  React.useLayoutEffect(() => {
    drawRef.current = draw;
    draw();
  });

  /* ------------------------------ scrolling ----------------------------- */

  const leader = React.useRef<0 | 1>(0);
  const glides = React.useRef<
    [AnimationPlaybackControls | null, AnimationPlaybackControls | null]
  >([null, null]);
  const stopGlides = () => {
    for (const slot of [0, 1] as const) {
      glides.current[slot]?.stop();
      glides.current[slot] = null;
    }
  };
  React.useEffect(() => stopGlides, []);

  const targetFor = (lead: 0 | 1, at?: number): number | null => {
    const follow: 0 | 1 = lead === 0 ? 1 : 0;
    const gl = geoRef.current[lead];
    const gf = geoRef.current[follow];
    const el = scrollers.current[lead];
    if (!gl || !gf || !el) return null;
    const line = lineFor(gl);
    const order = (docs[lead]?.sections ?? [])
      .map((s) => s.anchor)
      .filter((id) => gf.tops[id] && gl.tops[id]);
    const points = keypoints(gl, gf, order, line);
    return clamp(
      Math.round(mapThrough(points, (at ?? el.scrollTop) + line) - line),
      0,
      Math.max(0, gf.total - gf.view),
    );
  };

  const glideTo = (slot: 0 | 1, to: number) => {
    const el = scrollers.current[slot];
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const target = clamp(Math.round(to), 0, max);
    glides.current[slot]?.stop();
    glides.current[slot] = null;
    if (!motionSafe || Math.abs(target - el.scrollTop) < 1) {
      el.scrollTop = target;
      drawRef.current();
      return;
    }
    glides.current[slot] = animate(el.scrollTop, target, {
      ...springs.glide,
      onUpdate: (v) => {
        el.scrollTop = v;
        drawRef.current();
      },
      onComplete: () => {
        glides.current[slot] = null;
      },
    });
  };

  const [current, setCurrent] = React.useState<string | null>(
    () => documents[0]?.sections[0]?.anchor ?? null,
  );
  // The section in view is a reading: the host hears the first one too.
  const firstSection = React.useRef(current);
  const onSectionRef = React.useRef(onSectionChange);
  React.useEffect(() => {
    onSectionRef.current = onSectionChange;
  });
  React.useEffect(() => {
    if (firstSection.current) onSectionRef.current?.(firstSection.current);
  }, []);
  const trackCurrent = (slot: 0 | 1) => {
    const g = geoRef.current[slot];
    const el = scrollers.current[slot];
    const doc = docs[slot];
    if (!g || !el || !doc) return;
    const at = el.scrollTop + lineFor(g);
    let found: string | null = doc.sections[0]?.anchor ?? null;
    for (const s of doc.sections) {
      const t = g.tops[s.anchor];
      if (t && t.top <= at) found = s.anchor;
    }
    if (found && found !== current) {
      setCurrent(found);
      onSectionChange?.(found);
    }
  };

  const onPaneScroll = (slot: 0 | 1) => {
    const gliding = Boolean(glides.current[0] || glides.current[1]);
    if (isLocked && pairComplete && !gliding && leader.current === slot) {
      const follow: 0 | 1 = slot === 0 ? 1 : 0;
      const target = targetFor(slot);
      const el = scrollers.current[follow];
      if (el && target !== null && Math.abs(el.scrollTop - target) >= 0.5) {
        el.scrollTop = target;
      }
    }
    drawRef.current();
    if (leader.current === slot) trackCurrent(slot);
  };

  const lead = (slot: 0 | 1) => {
    if (leader.current !== slot || glides.current[0] || glides.current[1]) {
      stopGlides();
    }
    leader.current = slot;
  };

  // Locking glides whichever pane drifted back to the one that leads; a host
  // that flips `locked` gets the same glide.
  const shownLock = React.useRef(isLocked);
  React.useEffect(() => {
    if (shownLock.current === isLocked) return;
    shownLock.current = isLocked;
    if (!isLocked || !pairComplete) return;
    const follow: 0 | 1 = leader.current === 0 ? 1 : 0;
    const target = targetFor(leader.current);
    if (target !== null) glideTo(follow, target);
    // targetFor and glideTo read the latest refs; only the lock starts this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, pairComplete]);

  const jumpTo = (anchor: string) => {
    stopGlides();
    const label = anchors.find((a) => a.id === anchor)?.label ?? anchor;
    const has = ([0, 1] as const).filter((slot) =>
      docs[slot]?.sections.some((s) => s.anchor === anchor),
    );
    const visible = narrow ? [slotOf(tab)] : [0, 1];
    for (const slot of has) {
      const g = geoRef.current[slot];
      const t = g?.tops[anchor];
      if (!g || !t) continue;
      glideTo(slot, t.top - lineFor(g));
    }
    // A pane without the section follows the one that has it when locked.
    if (isLocked && pairComplete && has.length === 1) {
      const from = has[0] as 0 | 1;
      const to: 0 | 1 = from === 0 ? 1 : 0;
      const g = geoRef.current[from];
      const t = g?.tops[anchor];
      if (g && t) {
        const at = clamp(t.top - lineFor(g), 0, Math.max(0, g.total - g.view));
        const target = targetFor(from, at);
        if (target !== null) glideTo(to, target);
      }
    }
    if (has.length && visible.every((s) => !has.includes(s as 0 | 1))) {
      setAnnouncement(`${label} is not in this version.`);
    } else {
      setAnnouncement(`Jumped to ${label}.`);
    }
    setCurrent(anchor);
    onSectionChange?.(anchor);
  };

  /* ------------------------------ swap/tabs ----------------------------- */

  const [tab, setTab] = React.useState<LockstepSide>("left");
  const [enter, setEnter] = React.useState<
    [{ n: number; dir: number }, { n: number; dir: number }]
  >([
    { n: 0, dir: 1 },
    { n: 0, dir: 1 },
  ]);
  const [swapping, setSwapping] = React.useState(false);
  React.useEffect(() => {
    if (!swapping) return;
    const t = window.setTimeout(() => setSwapping(false), 460);
    return () => window.clearTimeout(t);
  }, [swapping]);

  const swap = () => {
    const nextLeft: 0 | 1 = rightSlot;
    setLeftKey(keyOf(nextLeft));
    if (motionSafe) setSwapping(true);
    const order: LockstepPair = [
      documents[nextLeft] ?? null,
      documents[leftSlot] ?? null,
    ];
    onSwap?.(order);
    const l = order[0]?.version ?? "an empty pane";
    const r = order[1]?.version ?? "an empty pane";
    setAnnouncement(`${l} on the left, ${r} on the right.`);
  };

  const showTab = (next: LockstepSide, focus = false) => {
    const from = slotOf(tab);
    const to = slotOf(next);
    if (next !== tab) {
      // Locked, the version you switch to opens at the place you were reading.
      if (isLocked && pairComplete) {
        const target = targetFor(from);
        const el = scrollers.current[to];
        if (el && target !== null) el.scrollTop = target;
      }
      leader.current = to;
      setTab(next);
      setEnter((prev) => {
        const out: [{ n: number; dir: number }, { n: number; dir: number }] = [
          ...prev,
        ];
        out[to] = { n: prev[to].n + 1, dir: next === "right" ? 1 : -1 };
        return out;
      });
      const d = docs[to] ?? closedAt(to);
      setAnnouncement(`Showing ${d?.version ?? "the empty pane"}.`);
    }
    if (focus) {
      window.requestAnimationFrame(() => scrollers.current[to]?.focus());
    }
  };

  /* ------------------------------- closing ------------------------------ */

  const close = (slot: 0 | 1) => {
    const d = documents[slot];
    if (!d) return;
    stopGlides();
    setClosed((prev) => (prev.includes(d.id) ? prev : [...prev, d.id]));
    onClosePane?.(sideOf(slot), d);
    setAnnouncement(`${d.version} closed.`);
  };
  const reopen = (slot: 0 | 1) => {
    const d = documents[slot];
    if (!d) return;
    setClosed((prev) => prev.filter((id) => id !== d.id));
    onReopenPane?.(sideOf(slot), d);
    setAnnouncement(`${d.version} reopened.`);
  };

  /* ------------------------------ keyboard ------------------------------ */

  const onFrameKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "l"
    ) {
      event.preventDefault();
      setLock(!isLocked);
      return;
    }
    if (
      event.altKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      event.preventDefault();
      const side: LockstepSide = event.key === "ArrowLeft" ? "left" : "right";
      if (narrow) showTab(side, true);
      else scrollers.current[slotOf(side)]?.focus();
    }
  };

  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const [stripFocus, setStripFocus] = React.useState(0);
  const stripButtons = React.useRef(new Map<string, HTMLButtonElement>());
  const onStripKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    const n = stripAnchors.length;
    let to = -1;
    if (event.key === "ArrowRight") to = (i + 1) % n;
    else if (event.key === "ArrowLeft") to = (i - 1 + n) % n;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    if (to < 0 || event.altKey) return;
    event.preventDefault();
    setStripFocus(to);
    const id = stripAnchors[to]?.id;
    if (id) stripButtons.current.get(id)?.focus();
  };

  // Keep the section in view visible in the strip without scrolling the page.
  React.useEffect(() => {
    const strip = stripRef.current;
    const button = current ? stripButtons.current.get(current) : undefined;
    if (!strip || !button) return;
    const left = button.offsetLeft - 24;
    const right = button.offsetLeft + button.offsetWidth + 24;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (right > strip.scrollLeft + strip.clientWidth)
      strip.scrollLeft = right - strip.clientWidth;
  }, [current]);

  /* ------------------------------- render ------------------------------- */

  const vars = {
    "--lp-accent": accent,
    "--lp-wash": `color-mix(in oklab, ${accent} 8%, transparent)`,
    "--lp-line": `color-mix(in oklab, ${accent} 45%, transparent)`,
    "--lp-solid": `oklch(from ${accent} 0.55 c h)`,
    "--lp-on": "oklch(0.99 0.004 262)",
    "--lp-gutter": `${Math.max(8, Math.round(gutter))}px`,
    height,
  } as React.CSSProperties;

  const summary = pairComplete
    ? [
        counts.changed ? `${counts.changed} changed` : null,
        counts.added ? `${counts.added} new` : null,
        counts.removed ? `${counts.removed} dropped` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "No differences"
    : null;

  const [hot, setHot] = React.useState<string | null>(null);
  const otherTab: LockstepSide = tab === "left" ? "right" : "left";
  const otherDoc = docs[slotOf(otherTab)] ?? closedAt(slotOf(otherTab));
  const bandBase = clamp(bandOpacity, 0, 1);
  const tabbableStrip = Math.min(
    stripFocus,
    Math.max(0, stripAnchors.length - 1),
  );

  const lockSwitch = (
    <button
      type="button"
      role="switch"
      aria-checked={isLocked && pairComplete}
      aria-disabled={!pairComplete || undefined}
      aria-label="Lock scrolling"
      aria-keyshortcuts="Control+L Meta+L"
      title="Lock scrolling (Ctrl or Cmd+L)"
      onClick={() => setLock(!isLocked)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border px-2.5 text-[12px] font-medium transition-colors",
        isLocked && pairComplete
          ? "border-(--lp-line) bg-(--lp-wash) text-(--lp-accent)"
          : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
        !pairComplete && "opacity-55",
        FOCUS,
      )}
    >
      <Padlock locked={isLocked && pairComplete} motionSafe={motionSafe} />
      <span aria-hidden className="grid">
        <span
          className={cn(
            "[grid-area:1/1]",
            !(isLocked && pairComplete) && "invisible",
          )}
        >
          Locked
        </span>
        <span
          className={cn(
            "[grid-area:1/1]",
            isLocked && pairComplete && "invisible",
          )}
        >
          Unlocked
        </span>
      </span>
    </button>
  );

  return (
    <section
      ref={setFrame}
      aria-labelledby={`${uid}-title`}
      onKeyDown={onFrameKey}
      className={cn(
        "@container/lockstep-panes relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={vars}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-2.5">
        <div className="min-w-0">
          <h2
            id={`${uid}-title`}
            className="truncate text-[14px] leading-5 font-semibold"
          >
            {title}
          </h2>
          <p className="truncate font-mono text-[10.5px] leading-4 text-ink-3">
            {summary ? `${subtitle} · ${summary}` : subtitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {lockSwitch}
          <button
            type="button"
            aria-label="Swap panes"
            title="Swap panes"
            onClick={swap}
            disabled={status !== "ready"}
            className={cn(
              "hidden size-8 shrink-0 items-center justify-center rounded-2 border border-hairline text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 @min-[30rem]/lockstep-panes:inline-flex",
              FOCUS,
            )}
          >
            <ArrowLeftRight aria-hidden className="size-3.5" />
          </button>
        </div>
      </header>

      {stripAnchors.length > 0 ? (
        <div className="relative shrink-0 border-b border-hairline">
          <motion.div
            ref={stripRef}
            layoutScroll
            role="toolbar"
            aria-label="Sections"
            className="flex [scrollbar-width:none] gap-1 overflow-x-auto px-3 py-1.5"
          >
            {stripAnchors.map((a, i) => {
              const change = showChanges ? (changes[a.id] ?? "same") : "same";
              const isCurrent = current === a.id;
              return (
                <button
                  key={a.id}
                  ref={(node) => {
                    if (node) stripButtons.current.set(a.id, node);
                    else stripButtons.current.delete(a.id);
                  }}
                  type="button"
                  tabIndex={i === tabbableStrip ? 0 : -1}
                  aria-current={isCurrent ? "location" : undefined}
                  aria-label={`${a.label}${change === "changed" ? ", changed" : change === "added" ? ", new" : change === "removed" ? ", dropped" : ""}`}
                  onFocus={() => setStripFocus(i)}
                  onKeyDown={(event) => onStripKey(event, i)}
                  onClick={() => {
                    setStripFocus(i);
                    jumpTo(a.id);
                  }}
                  className={cn(
                    "relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] whitespace-nowrap transition-colors",
                    isCurrent
                      ? "text-foreground"
                      : "text-ink-3 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  {isCurrent ? (
                    <motion.span
                      layoutId={`${uid}-strip-pill`}
                      aria-hidden
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-2"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className={cn(
                      "relative size-1.5 shrink-0 rounded-full",
                      change === "changed" || change === "added"
                        ? "bg-(--lp-accent)"
                        : change === "removed"
                          ? "border border-ink-3"
                          : "bg-hairline-strong",
                    )}
                  />
                  <span className="relative">{a.label}</span>
                </button>
              );
            })}
          </motion.div>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-linear-to-r from-card to-transparent"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-card to-transparent"
          />
        </div>
      ) : null}

      {/* Phone: the two panes become tabs, with a swap that keeps your place. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-hairline px-3 py-1.5 @min-[30rem]/lockstep-panes:hidden">
        <div
          role="tablist"
          aria-label="Versions"
          className="flex min-w-0 flex-1 gap-1"
        >
          {(["left", "right"] as const).map((side) => {
            const slot = slotOf(side);
            const d = docs[slot] ?? closedAt(slot);
            const selected = tab === side;
            return (
              <button
                key={side}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${uid}-pane-${slot}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => showTab(side)}
                onKeyDown={(event) => {
                  if (event.altKey) return;
                  if (
                    event.key === "ArrowLeft" ||
                    event.key === "ArrowRight" ||
                    event.key === "Home" ||
                    event.key === "End"
                  ) {
                    event.preventDefault();
                    const next: LockstepSide =
                      event.key === "Home"
                        ? "left"
                        : event.key === "End"
                          ? "right"
                          : side === "left"
                            ? "right"
                            : "left";
                    showTab(next);
                    window.requestAnimationFrame(() =>
                      frame
                        ?.querySelector<HTMLButtonElement>(
                          `[data-lp-tab="${next}"]`,
                        )
                        ?.focus(),
                    );
                  }
                }}
                data-lp-tab={side}
                className={cn(
                  "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-2 px-2.5 text-[12px] transition-colors",
                  selected
                    ? "bg-surface-2 font-medium text-foreground"
                    : "text-ink-3 hover:text-foreground",
                  FOCUS,
                )}
              >
                <span className="font-mono text-[11px]">
                  {d?.version ?? "—"}
                </span>
                <span className="truncate">
                  {d ? (d.meta.split(" ")[0] ?? d.title) : "Empty"}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label={`Switch to ${otherDoc?.version ?? "the other pane"}`}
          title="Switch version, same place"
          onClick={() => showTab(otherTab)}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <ArrowLeftRight aria-hidden className="size-3.5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div className="grid h-full grid-cols-1 grid-rows-1 @min-[30rem]/lockstep-panes:grid-cols-[minmax(0,1fr)_var(--lp-gutter)_minmax(0,1fr)]">
          {([0, 1] as const).map((slot) => {
            const side = sideOf(slot);
            const inactive = side !== tab;
            const other: 0 | 1 = slot === 0 ? 1 : 0;
            return (
              <motion.div
                key={keyOf(slot)}
                layout="position"
                transition={{
                  layout: motionSafe ? springs.glide : { duration: 0 },
                }}
                inert={narrow && inactive ? true : undefined}
                className={cn(
                  "col-start-1 row-start-1 overflow-hidden @min-[30rem]/lockstep-panes:col-start-(--lp-col)",
                  inactive && "@max-[30rem]/lockstep-panes:invisible",
                )}
                style={
                  { "--lp-col": side === "left" ? 1 : 3 } as React.CSSProperties
                }
              >
                <Pane
                  uid={uid}
                  slot={slot}
                  side={side}
                  doc={docs[slot]}
                  closedDoc={closedAt(slot)}
                  status={status}
                  changes={changes}
                  otherVersion={docs[other]?.version ?? null}
                  showChanges={showChanges && pairComplete}
                  hot={hot}
                  enter={enter[slot]}
                  motionSafe={motionSafe}
                  onHot={setHot}
                  onScroll={() => onPaneScroll(slot)}
                  onLead={() => lead(slot)}
                  onClose={() => close(slot)}
                  onReopen={() => reopen(slot)}
                  onPick={
                    onPickDocument
                      ? () => onPickDocument(sideOf(slot))
                      : undefined
                  }
                  onRetry={onRetry}
                  scrollerRef={slot === 0 ? setScroller0 : setScroller1}
                  articleRef={slot === 0 ? setArticle0 : setArticle1}
                  sectionRef={sectionRef(slot)}
                />
              </motion.div>
            );
          })}

          <div
            aria-hidden
            className="col-start-2 row-start-1 hidden flex-col border-x border-hairline bg-surface-1 @min-[30rem]/lockstep-panes:flex"
          >
            <div className="h-11 shrink-0 border-b border-hairline" />
            <div ref={gutterBox} className="relative flex-1 overflow-hidden">
              <motion.svg
                className="absolute inset-0 size-full"
                initial={false}
                animate={{ opacity: swapping || !pairComplete ? 0 : 1 }}
                transition={{
                  duration: swapping ? durations.blink : durations.base,
                  ease: easings.enter,
                }}
              >
                {shared.map((id) => {
                  const accentBand =
                    showChanges && (changes[id] ?? "same") !== "same";
                  const base = accentBand ? bandBase : bandBase * 0.55;
                  const lit = hot === id ? base + 0.25 : base;
                  const fill = r2(clamp(lit * (isLocked ? 1 : 0.6), 0, 1));
                  return (
                    <g
                      key={id}
                      onPointerEnter={() => setHot(id)}
                      onPointerLeave={() => setHot(null)}
                      className={
                        accentBand
                          ? "fill-(--lp-accent) stroke-(--lp-accent)"
                          : "fill-ink-3 stroke-ink-3"
                      }
                    >
                      <path
                        ref={bandRef(id, "fill")}
                        stroke="none"
                        className="transition-[fill-opacity] duration-150"
                        style={{ fillOpacity: fill }}
                      />
                      <path
                        ref={bandRef(id, "edge")}
                        fill="none"
                        strokeWidth={1}
                        className="transition-[stroke-opacity] duration-150"
                        style={{
                          strokeOpacity: r2(Math.min(1, fill + 0.25)),
                        }}
                      />
                    </g>
                  );
                })}
              </motion.svg>
            </div>
          </div>
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
