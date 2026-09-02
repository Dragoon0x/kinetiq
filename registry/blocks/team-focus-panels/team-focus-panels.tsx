"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { FocusRail, type FocusRailItem } from "@/registry/ui/focus-rail";

export type FocusMember = {
  id: string;
  name: string;
  role: string;
  /** One working line — what they actually tend. */
  tends: string;
  bio: string;
  links: { label: string; href: string }[];
};

export type TeamFocusPanelsProps = {
  eyebrow?: string;
  headline?: string;
  deck?: string;
  members?: FocusMember[];
  className?: string;
};

const DEFAULT_MEMBERS: FocusMember[] = [
  {
    id: "m1",
    name: "Priya Nakashima",
    role: "Founder",
    tends: "The propagation calendar and which cultivars get another season.",
    bio: "Ran a wholesale nursery outside Salinas for eleven years before she got tired of the spreadsheet and built the thing that replaced it.",
    links: [
      { label: "Notes", href: "#notes-nakashima" },
      { label: "Elsewhere", href: "#elsewhere-nakashima" },
    ],
  },
  {
    id: "m2",
    name: "Dominic Vasquez",
    role: "Systems",
    tends: "The sensor mesh and every alert that fires off it.",
    bio: "Spent six seasons keeping irrigation controllers alive in the field before he moved the whole stack onto something that reports back.",
    links: [
      { label: "Notes", href: "#notes-vasquez" },
      { label: "Elsewhere", href: "#elsewhere-vasquez" },
    ],
  },
  {
    id: "m3",
    name: "Elin Radomska",
    role: "Agronomy",
    tends:
      "Soil chemistry, graft failures, and the log that ties them together.",
    bio: "Trained as a plant pathologist and still walks a bench before she trusts a dashboard.",
    links: [
      { label: "Notes", href: "#notes-radomska" },
      { label: "Elsewhere", href: "#elsewhere-radomska" },
    ],
  },
  {
    id: "m4",
    name: "Farid Kessler",
    role: "Field",
    tends: "Grower visits and the notebook of what actually broke this week.",
    bio: "Spends more nights in a truck than an office, which is exactly why the roadmap listens to him.",
    links: [
      { label: "Notes", href: "#notes-kessler" },
      { label: "Elsewhere", href: "#elsewhere-kessler" },
    ],
  },
  {
    id: "m5",
    name: "Noor Whitfield",
    role: "Support",
    tends: "The four-hour reply promise, especially during ship season.",
    bio: "Answered nursery phones before Fernworks existed, so she already knew which questions actually matter.",
    links: [
      { label: "Notes", href: "#notes-whitfield" },
      { label: "Elsewhere", href: "#elsewhere-whitfield" },
    ],
  },
  {
    id: "m6",
    name: "Talia Bosch",
    role: "Research",
    tends: "Root rot patterns across every greenhouse the platform touches.",
    bio: "Turns three seasons of sensor logs into the one chart a grower needs before Friday.",
    links: [
      { label: "Notes", href: "#notes-bosch" },
      { label: "Elsewhere", href: "#elsewhere-bosch" },
    ],
  },
];

const WIDE_QUERY = "(min-width: 640px)";

function subscribeWide(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getWideSnapshot(): boolean {
  return window.matchMedia(WIDE_QUERY).matches;
}

/** A prerender has no viewport to test, so it reports wide — matching the
 * horizontal markup hydration must not contradict; the true width lands
 * once the client store subscribes. */
function getWideServerSnapshot(): boolean {
  return true;
}

/** True from `sm` (640px) up. Drives the rail's orientation switch without ever reading `window` during render. */
function useIsWide(): boolean {
  return React.useSyncExternalStore(
    subscribeWide,
    getWideSnapshot,
    getWideServerSnapshot,
  );
}

/**
 * A deterministic wash per member position, graded off var(--primary) and
 * var(--ink-2), so six plates read as a set instead of six repeats of the
 * same tile. The active plate leans further into the primary tint; the
 * shift only ever resolves through the plate's own CSS transition.
 */
function plateTint(index: number, active: boolean): string {
  const primaryPct = (active ? 32 : 12) + (index % 5) * 4;
  const inkPct = 10 + ((index + 2) % 5) * 3;
  return `color-mix(in oklab, var(--primary) ${primaryPct}%, color-mix(in oklab, var(--ink-2) ${inkPct}%, var(--color-surface-1)))`;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * The large collapsed-face plate. Deliberately a plain `<span>`, not a
 * `<motion.span>` — motion cannot interpolate a `color-mix()`/`var()`
 * background, so the wash only ever moves through the CSS `transition-colors`
 * already on the element.
 */
function InitialsPlate({
  name,
  index,
  active,
}: {
  name: string;
  index: number;
  active: boolean;
}) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: plateTint(index, active) }}
      className="flex size-14 shrink-0 items-center justify-center rounded-3 border border-hairline font-mono text-base tracking-[0.04em] text-ink transition-colors duration-300"
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * The team on the same rail focus-rail already drives for a gallery —
 * flex-grow, the glide spring, and hover-preview-versus-committed-press all
 * come from FocusRail; this block only draws two faces on top of it through
 * `renderPanel`: an initials plate with a name and a role at rest, and a
 * "tends" line plus a short bio once a panel wins the pointer or the focus
 * ring. FocusRail's panel is a real `<button>`, and a real `<a>` cannot
 * legally sit inside one, so the active member's two links live in a
 * sibling `aria-live="polite"` row beneath the rail instead of inside the
 * panel — tracked off FocusRail's `onActiveChange` (a controlled `activeId`)
 * so the row always matches the committed panel, never a passing hover
 * preview. Below `sm` the rail turns vertical and stacks, decided by a
 * matchMedia store rather than a window read during render.
 *
 * Reduced motion: the resize and the plate-to-bio swap are FocusRail's own
 * instant path; this block adds nothing that moves beyond the initials
 * plate's CSS color transition.
 */
export function TeamFocusPanels({
  eyebrow = "Fernworks · the people",
  headline = "Six people, one greenhouse of decisions.",
  deck = "Every name below answers for one failure mode, not a job title — root rot, a bad graft, a shipment that lands wilted. Move focus to a panel to see which one is theirs.",
  members = DEFAULT_MEMBERS,
  className,
}: TeamFocusPanelsProps) {
  const headingId = React.useId();
  const isWide = useIsWide();
  const [activeId, setActiveId] = React.useState(members[0]?.id ?? "");
  // The hover preview is display-only inside the rail, but the links row
  // should show the member the reader is looking at, so it follows the
  // preview while one exists and returns to the committed member after.
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const shownId = previewId ?? activeId;

  const memberEntries = members.map((member, index) => ({ ...member, index }));
  const items: FocusRailItem[] = members.map((member) => ({
    id: member.id,
    label: member.name,
  }));
  const activeMember = memberEntries.find((entry) => entry.id === shownId);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{deck}</p>
        </div>

        <div className="mt-12">
          <div className={cn(isWide ? "h-80" : "h-[44rem]")}>
            <FocusRail
              items={items}
              activeId={activeId}
              onActiveChange={setActiveId}
              onPreviewChange={setPreviewId}
              label="Team"
              expandOn="hover"
              grow={3}
              orientation={isWide ? "horizontal" : "vertical"}
              className={isWide ? "h-full" : undefined}
              renderPanel={(item, { active }) => {
                const entry = memberEntries.find(
                  (candidate) => candidate.id === item.id,
                );
                if (!entry) return null;
                return (
                  <div className="flex min-w-0 flex-col items-start gap-3">
                    <InitialsPlate
                      name={entry.name}
                      index={entry.index}
                      active={active}
                    />
                    <div className="max-w-full min-w-[6.5rem] overflow-hidden">
                      <p className="truncate font-medium text-ink">
                        {entry.name}
                      </p>
                      <p className="mt-0.5 truncate text-label text-ink-3">
                        {entry.role}
                      </p>
                    </div>
                    {active ? (
                      <div className="min-w-0 overflow-hidden">
                        <p className="line-clamp-2 text-sm leading-relaxed text-ink-2">
                          {entry.tends}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-ink-3">
                          {entry.bio}
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              }}
            />
          </div>

          {/*
            FocusRail's panel is a real <button>; a real <a> cannot legally
            nest inside one. Rather than let renderPanel emit invalid HTML,
            the active member's links live here, in a sibling row the rail
            never wraps. aria-live="polite" announces the swap as a press or
            a keyboard move commits a new panel — a hover preview never
            touches this row, since it never calls onActiveChange either.
          */}
          <div
            aria-live="polite"
            className="mt-6 min-h-9 border-t border-hairline pt-4"
          >
            {activeMember ? (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="text-ink-3">{activeMember.name}</span>
                {activeMember.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-ink-2 underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
