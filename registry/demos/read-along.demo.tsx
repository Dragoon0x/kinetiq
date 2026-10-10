"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ReadAlong } from "@/registry/ui/read-along";

export const tweaks = defineTweaks({
  faint: {
    kind: "range",
    label: "Faint",
    default: 0.2,
    min: 0.05,
    max: 0.6,
    step: 0.05,
  },
  range: {
    kind: "range",
    label: "Range",
    default: 0.5,
    min: 0.2,
    max: 1,
    step: 0.05,
  },
  cursor: {
    kind: "choice",
    label: "Cursor",
    default: "underline",
    options: ["underline", "caret", "none"],
    names: { underline: "Line", caret: "Caret", none: "Off" },
  },
});

const NOTES =
  "We walked the east field at first light, when the dew still shows where the drainage fails. Three rows dip toward the hedge and hold water past noon; the soil there smells of iron and the clover has given up. Fieldline's probes agree within a percent of what the boots told us. Next week we cut a shallow swale along the low side and plant the margin with rye.";
const WORD_COUNT = NOTES.split(" ").length;

/**
 * Fieldline field notes: the entry darkens word by word as it is scrolled
 * past, so a reader keeps their place in a long survey.
 */
export function ReadAlongDemo({
  chrome = true,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const viewport = React.useRef<HTMLDivElement | null>(null);
  const [word, setWord] = React.useState(0);
  const [done, setDone] = React.useState(false);

  const notes = (
    <div className="relative w-full">
      <div
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="Fieldline field notes, scrollable"
        className="h-[196px] w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-surface-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      >
        <div className="flex flex-col gap-3 px-5 pt-4 pb-32">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            <span>Fieldline · east field survey</span>
            <span aria-hidden>scroll ↓</span>
          </div>
          <ReadAlong
            text={NOTES}
            scrollContainer={viewport}
            onWordChange={setWord}
            onProgressChange={(p) => setDone(p >= 1)}
            {...values}
            className="mt-10 text-[15px] leading-[1.6] text-foreground @md:text-[17px]"
          />
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Filed by the north crew · probes 12 to 19
          </p>
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-px bottom-px h-10 rounded-b-3 bg-gradient-to-t from-surface-1 to-transparent"
      />
    </div>
  );

  if (!chrome) {
    return <div className="@container flex w-full max-w-2xl">{notes}</div>;
  }

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-4">
      {notes}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {done
              ? "read to the end"
              : `reading word ${word + 1} of ${WORD_COUNT}`}
          </span>{" "}
          · scroll the notes
        </p>
        <button
          type="button"
          onClick={() =>
            viewport.current?.scrollTo({ top: 0, behavior: "smooth" })
          }
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Back to top
        </button>
      </div>
    </div>
  );
}
