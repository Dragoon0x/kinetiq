"use client";

import * as React from "react";

import { Bookmark } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CapillaryCursor } from "@/registry/ui/capillary-cursor";

export const tweaks = defineTweaks({
  inkColor: {
    kind: "choice",
    label: "Ink",
    default: "cobalt",
    options: ["cobalt", "iron", "sepia", "carmine"],
    names: {
      cobalt: "Cobalt",
      iron: "Iron",
      sepia: "Sepia",
      carmine: "Carmine",
    },
  },
  wickSpeed: {
    kind: "range",
    label: "Wick",
    default: 520,
    min: 150,
    max: 1500,
    step: 50,
    unit: "px/s",
  },
  dotSize: {
    kind: "range",
    label: "Drop",
    default: 14,
    min: 6,
    max: 28,
    step: 2,
    unit: "px",
  },
});

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Fieldline's beta sign-up card, with the cursor as a drop of ink that fills
 * each control it touches — a pill, a rounded button, a square one, a link.
 */
export function CapillaryCursorDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  void sound;
  const [held, setHeld] = React.useState<string | null>(null);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <CapillaryCursor
        onTargetChange={(el) =>
          setHeld(
            el
              ? (el.getAttribute("aria-label") ?? el.textContent ?? "").trim()
              : null,
          )
        }
        className="rounded-3"
        {...values}
      >
        <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm font-semibold text-foreground">
              Fieldline beta
            </p>
            <a
              href="#fieldline-notes"
              onClick={(event) => event.preventDefault()}
              className={`rounded-1 text-xs text-cobalt-bright underline underline-offset-2 ${RING}`}
            >
              Read the field notes
            </a>
          </div>
          <p className="text-xs text-ink-2">
            Trail maps that sync before you lose signal. Forty places left this
            month.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`h-9 rounded-full bg-foreground px-4 text-sm font-medium text-background ${RING}`}
            >
              Join the beta
            </button>
            <button
              type="button"
              className={`h-9 rounded-2 border border-hairline-strong bg-surface-2 px-3.5 text-sm text-foreground ${RING}`}
            >
              See the tour
            </button>
            <button
              type="button"
              aria-label="Save for later"
              className={`grid size-9 place-items-center rounded-1 border border-hairline-strong bg-surface-2 text-ink-2 ${RING}`}
            >
              <Bookmark aria-hidden className="size-4 shrink-0" />
            </button>
          </div>
        </div>
      </CapillaryCursor>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {held ? (
            <>
              <span className="text-signal">ink</span> · filling {held}
            </>
          ) : (
            <>
              <span className="text-signal">ink</span> · in the drop · touch a
              control
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
