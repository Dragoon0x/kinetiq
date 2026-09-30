"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { CornerPip, type CornerPipValue } from "@/registry/ui/corner-pip";

export const tweaks = defineTweaks({
  friction: {
    kind: "range",
    label: "Friction",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  inset: {
    kind: "range",
    label: "Inset",
    default: 12,
    min: 0,
    max: 24,
    step: 4,
    unit: "px",
  },
  tuck: { kind: "toggle", label: "Tuck", default: true },
  size: {
    kind: "choice",
    label: "Size",
    default: "md",
    options: ["sm", "md", "lg"],
    names: { sm: "Small", md: "Medium", lg: "Large" },
  },
});

/** The page behind the call: a Fieldline Docs roadmap, drawn as a sketch. */
function RoadmapPage() {
  return (
    <div aria-hidden className="flex size-full flex-col gap-2 p-4">
      <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline Docs · Q3 roadmap
      </p>
      <span className="h-3 w-2/5 rounded-1 bg-ink/15" />
      <span className="h-2 w-full rounded-1 bg-ink/8" />
      <span className="h-2 w-11/12 rounded-1 bg-ink/8" />
      <span className="h-2 w-3/4 rounded-1 bg-ink/8" />
      <div className="mt-1 grid w-3/5 grid-cols-3 gap-1">
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={cn("h-3 rounded-1", i < 3 ? "bg-ink/12" : "bg-ink/6")}
          />
        ))}
      </div>
    </div>
  );
}

function Tile({
  initials,
  speaking = false,
  muted = false,
}: {
  initials: string;
  speaking?: boolean;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative flex flex-1 items-center justify-center rounded-1 bg-ink/8",
        speaking && "ring-1 ring-success",
      )}
    >
      <span className="flex size-6 items-center justify-center rounded-full bg-cobalt-wash font-mono text-[9px] text-cobalt-bright">
        {initials}
      </span>
      {muted ? (
        <span className="absolute right-1 bottom-1 size-1.5 rounded-full bg-danger" />
      ) : null}
    </span>
  );
}

/**
 * A design review call floating over a Fieldline Docs page. Throw it into a
 * corner, or off the side to tuck it away; the mute button really mutes.
 */
export function CornerPipDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [place, setPlace] = React.useState<CornerPipValue>({
    corner: "bottom-right",
    tucked: false,
  });
  const [muted, setMuted] = React.useState(false);
  const tucked = place.tucked && values.tuck !== false;

  return (
    <div className="flex w-full max-w-104 flex-col gap-3">
      <CornerPip
        label="Design review"
        value={place}
        onValueChange={setPlace}
        sound={sound}
        {...values}
        player={
          <div className="flex size-full flex-col gap-1 bg-popover p-1">
            <div className="flex h-5 shrink-0 items-center gap-1.5 pr-6 pl-0.5">
              <span className="rounded-1 bg-danger px-1 font-mono text-[8px] leading-3 text-destructive-foreground">
                LIVE
              </span>
              <button
                type="button"
                aria-pressed={muted}
                aria-label="Mute"
                onClick={() => setMuted((m) => !m)}
                className="flex size-5 items-center justify-center rounded-full text-ink-2 outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring aria-pressed:text-danger"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 12 12"
                  className="size-3 fill-none stroke-current"
                  strokeWidth={1.3}
                  strokeLinecap="round"
                >
                  <rect x={4.25} y={1.5} width={3.5} height={6} rx={1.75} />
                  <path d="M2.5 6a3.5 3.5 0 0 0 7 0M6 9.5V11" />
                  {muted ? <path d="M2 2l8 8" /> : null}
                </svg>
              </button>
            </div>
            <div className="flex flex-1 gap-1">
              <Tile initials="MA" speaking />
              <Tile initials="JO" muted={muted} />
            </div>
          </div>
        }
      >
        <RoadmapPage />
      </CornerPip>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {tucked ? (
            <>
              <span className="text-signal">call tucked</span>
              {` · ${place.corner.endsWith("left") ? "left" : "right"} edge · pull the tab`}
            </>
          ) : (
            <>
              <span className="text-signal">call</span>
              {` · ${place.corner.replace("-", " ")} · fling it to a corner`}
              {muted ? " · muted" : ""}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
