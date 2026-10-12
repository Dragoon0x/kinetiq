"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultScrollItems,
  HangingScroll,
} from "@/registry/ui/hanging-scroll";

export const tweaks = defineTweaks({
  curl: {
    kind: "range",
    label: "Curl",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  rodSize: {
    kind: "range",
    label: "Rod size",
    default: 16,
    min: 10,
    max: 28,
    step: 2,
    unit: "px",
  },
  paperTone: {
    kind: "choice",
    label: "Paper",
    default: "rice",
    options: ["rice", "silk", "kraft", "indigo"],
    names: { rice: "Rice", silk: "Silk", kraft: "Kraft", indigo: "Indigo" },
  },
});

/**
 * The Waylight Gallery's winter room: five views of the Coldbrook valley
 * on one long scroll, rolled up overhead as the visitor reads down.
 */
export function HangingScrollDemo({
  chrome = true,
  // The paper rolls in silence: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const box = chrome ? 480 : 540;

  const room = (
    <div
      ref={boxRef}
      tabIndex={0}
      role="region"
      aria-label="Waylight Gallery, winter room"
      className="w-full overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-background outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      style={{ height: box }}
    >
      <div className="flex flex-col gap-1.5 px-5 pt-5 pb-3">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight Gallery · Winter room
        </p>
        <p className="max-w-prose text-sm text-ink-2">
          Five views of the Coldbrook valley on one scroll. Read down; it rolls
          away above you.
        </p>
      </div>
      <HangingScroll
        height={box - 2}
        label="Five views of the Coldbrook valley"
        onIndexChange={setIndex}
        onProgressChange={setProgress}
        {...values}
      />
      <div className="flex flex-col gap-2 px-5 pt-5 pb-8 text-sm text-ink-2">
        <p className="max-w-prose">
          Ink and wash on paper, mounted in the old way. The room is open until
          dusk; the scroll is rolled each evening and hung again at nine.
        </p>
      </div>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-3xl">{room}</div>;

  const caption = defaultScrollItems[index]?.caption ?? "";
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {room}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            picture {index + 1} of {defaultScrollItems.length}
          </span>
          {` · ${caption.toLowerCase()} · ${Math.round(progress * 100)}%`}
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
