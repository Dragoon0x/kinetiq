"use client";

import * as React from "react";

import { PathRider } from "@/registry/ui/path-rider";

const ROUTE =
  "M 20 150 C 60 150 54 100 96 96 C 138 92 130 40 170 40 C 210 40 204 96 244 104 C 276 110 280 142 300 140";

const COURIER = (
  <span className="flex size-7 items-center justify-center rounded-full border border-hairline-strong bg-surface-0 text-signal shadow-raised">
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-4 shrink-0 fill-none stroke-current"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7.5h9.5v8H3zM12.5 10h4l2.5 2.6v2.9h-6.5z" />
      <circle cx="7" cy="16.5" r="1.5" />
      <circle cx="16" cy="16.5" r="1.5" />
    </svg>
  </span>
);

export function PathRiderDemo() {
  const [scrub, setScrub] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PathRider
        path={ROUTE}
        rider={COURIER}
        progress={scrub / 100}
        playing={playing}
        duration={5000}
        label="Coldbrook overnight, depot 3 to the yard gate"
        onProgressChange={(value) => setScrub(Math.round(value * 100))}
        onPlayEnd={() => setPlaying(false)}
      />

      <div className="flex h-8 items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((was) => !was)}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-2 border border-hairline-strong bg-surface-1 px-3 text-xs font-medium text-ink transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-3.5 shrink-0 fill-current stroke-none"
          >
            {playing ? (
              <path d="M9 6h2.2v12H9zM12.8 6H15v12h-2.2z" />
            ) : (
              <path d="M8.5 5.8 18 12l-9.5 6.2z" />
            )}
          </svg>
          {playing ? "Pause" : "Play"}
        </button>

        <input
          type="range"
          min={0}
          max={100}
          value={scrub}
          aria-label="Scrub the route"
          aria-valuetext={`${scrub}%`}
          onChange={(event) => {
            setPlaying(false);
            setScrub(Number(event.target.value));
          }}
          className="h-8 min-w-0 flex-1 accent-[var(--primary)]"
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Progress <span className="text-signal tabular-nums">{scrub}%</span>
      </p>
    </div>
  );
}
