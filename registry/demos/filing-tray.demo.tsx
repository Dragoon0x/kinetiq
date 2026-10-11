"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FilingTray, defaultFilingCards } from "@/registry/ui/filing-tray";

export const tweaks = defineTweaks({
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 3,
    min: 0,
    max: 8,
    step: 0.5,
    unit: "°",
  },
  fade: {
    kind: "range",
    label: "Fade",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  offset: {
    kind: "range",
    label: "Offset",
    default: 8,
    min: 0,
    max: 16,
    step: 1,
    unit: "px",
  },
});

/**
 * Fieldline's survey log for a morning on the Coldbrook estuary: each note
 * files itself on the pile as the reader scrolls past it.
 */
export function FilingTrayDemo({
  chrome = true,
  // The pile is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const [filed, setFiled] = React.useState(0);
  const total = defaultFilingCards.length;
  const reading = defaultFilingCards[filed];
  const offset = values.offset ?? tweaks.offset.default;
  const offsetAtMount = React.useRef(offset);

  // The gallery card opens with two notes already on the pile, so the tilt,
  // the fade and the offset show before anyone scrolls.
  React.useEffect(() => {
    if (chrome) return;
    const box = boxRef.current;
    const items = box?.querySelectorAll("li");
    const second = items?.[1];
    const third = items?.[2];
    if (!box || !second || !third) return;
    const top = box.getBoundingClientRect().top;
    const natural = third.getBoundingClientRect().top - top + box.scrollTop;
    const pile = 34 + offsetAtMount.current + second.offsetHeight;
    box.scrollTop = Math.max(0, Math.round(natural - pile));
  }, [chrome]);

  const log = (
    <div
      ref={boxRef}
      tabIndex={0}
      role="region"
      aria-label="Fieldline survey log"
      className={
        chrome
          ? "h-[440px] w-full overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-background outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          : "h-[540px] w-full overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-background outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      }
    >
      <div className="flex flex-col gap-1.5 px-4 pt-5 pb-4">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline · Survey log
        </p>
        <p className="text-lg leading-tight font-semibold tracking-[-0.01em] text-foreground">
          Coldbrook estuary, day 3
        </p>
        <p className="text-xs text-ink-2">
          Eight notes from the morning tide. Scroll to file them.
        </p>
      </div>
      <FilingTray onFiledChange={setFiled} {...values} />
      <p className="px-4 pt-2 pb-8 text-xs text-ink-3">
        End of the morning log. The afternoon round starts at 14:00.
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{log}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4 self-center">
      {log}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            filed {filed} of {total}
          </span>
          {" · "}
          {reading
            ? `reading ${reading.meta} ${reading.title.toLowerCase()}`
            : "scroll back to lift them"}
        </p>
        <button
          type="button"
          onClick={() =>
            boxRef.current?.scrollTo({
              top: 0,
              behavior: motionSafe ? "smooth" : "auto",
            })
          }
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Back to top
        </button>
      </div>
    </div>
  );
}
