"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { LogoParade, type LogoParadeItem } from "@/registry/ui/logo-parade";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 40,
    min: 0,
    max: 120,
    step: 5,
    unit: "px/s",
  },
  gap: {
    kind: "range",
    label: "Gap",
    default: 48,
    min: 16,
    max: 96,
    step: 8,
    unit: "px",
  },
  rows: {
    kind: "range",
    label: "Rows",
    default: 2,
    min: 1,
    max: 3,
    step: 1,
  },
});

/** An invented wordmark: a small glyph in the mark's accent beside its name. */
function Wordmark({
  children,
  glyph,
}: {
  children: string;
  glyph: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-[0.45em] font-semibold tracking-tight">
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="h-[1.3em] w-auto shrink-0 fill-[var(--mark-color)] stroke-[var(--mark-color)] transition-colors duration-200"
      >
        {glyph}
      </svg>
      {children}
    </span>
  );
}

const MARKS: LogoParadeItem[] = [
  {
    id: "waylight",
    name: "Waylight",
    color: "oklch(from var(--warn) 0.74 c h)",
    mark: (
      <Wordmark
        glyph={
          <>
            <circle cx="12" cy="12" r="4.5" stroke="none" />
            <path
              d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        }
      >
        Waylight
      </Wordmark>
    ),
  },
  {
    id: "fieldline",
    name: "Fieldline",
    color: "var(--success)",
    mark: (
      <Wordmark
        glyph={
          <path
            d="M3 6h18M3 12h13M3 18h8"
            fill="none"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        }
      >
        Fieldline
      </Wordmark>
    ),
  },
  {
    id: "fernworks",
    name: "Fernworks",
    color: "var(--signal)",
    mark: (
      <Wordmark
        glyph={
          <path
            d="M12 21V4M12 8l-5-3M12 8l5-3M12 13l-6-3.5M12 13l6-3.5M12 18l-4.5-2.5M12 18l4.5-2.5"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
          />
        }
      >
        Fernworks
      </Wordmark>
    ),
  },
  {
    id: "gaugeworks",
    name: "Gaugeworks",
    color: "var(--accent-bright)",
    mark: (
      <Wordmark
        glyph={
          <>
            <path
              d="M4 17a8 8 0 1 1 16 0"
              fill="none"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path
              d="M12 17l4.5-6"
              fill="none"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="12" cy="17" r="2" stroke="none" />
          </>
        }
      >
        Gaugeworks
      </Wordmark>
    ),
  },
  {
    id: "basinworks",
    name: "Basinworks",
    color: "oklch(from var(--accent-bright) l c 300)",
    mark: (
      <Wordmark
        glyph={
          <>
            <path d="M3 9h18a9 9 0 0 1-18 0Z" stroke="none" />
            <path
              d="M6 5.5c2 1 4-1 6 0s4 1 6 0"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        }
      >
        Basinworks
      </Wordmark>
    ),
  },
  {
    id: "coldbrook",
    name: "Coldbrook",
    color: "oklch(from var(--signal) l c 215)",
    mark: (
      <Wordmark
        glyph={
          <path
            d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0"
            fill="none"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        }
      >
        Coldbrook
      </Wordmark>
    ),
  },
];

/**
 * Fieldline's customer wall: the crews that run it, on a conveyor that stops
 * for whichever mark you look at, and opens that crew's story when pressed.
 */
export function LogoParadeDemo({
  chrome = true,
  // The parade is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [looking, setLooking] = React.useState<string | null>(null);
  const [opened, setOpened] = React.useState<string | null>(null);
  const [paused, setPaused] = React.useState(false);
  const speed = values.speed ?? 40;

  const wall = (
    <div className="flex w-full flex-col gap-3">
      <p className="truncate text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Field-tested by the crews at
      </p>
      <LogoParade
        items={MARKS}
        label="Crews that run Fieldline"
        paused={paused}
        onLook={(item) => setLooking(item?.name ?? null)}
        onSelect={(item) => setOpened(item.name)}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full">{wall}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {wall}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {opened ? (
            <>
              <span className="text-signal">{opened}</span> · story opened
            </>
          ) : looking ? (
            <>
              <span className="text-signal">slowed for {looking}</span> · drag
              to throw it
            </>
          ) : paused ? (
            <>
              <span className="text-signal">paused</span> · every crew in view
            </>
          ) : (
            <>
              <span className="text-signal">parading</span> · {speed} px/s
            </>
          )}
        </p>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
          className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {/* Both labels share one cell so the button keeps its width. */}
          <span className="grid">
            <span
              className={cn("col-start-1 row-start-1", paused && "invisible")}
            >
              Pause
            </span>
            <span
              className={cn("col-start-1 row-start-1", !paused && "invisible")}
            >
              Resume
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
