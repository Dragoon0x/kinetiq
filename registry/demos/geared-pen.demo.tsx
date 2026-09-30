"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GearedPen } from "@/registry/ui/geared-pen";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  ratio: {
    kind: "range",
    label: "Ratio",
    default: 5,
    min: 2,
    max: 9,
    step: 0.5,
  },
  trail: {
    kind: "range",
    label: "Trail",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  ink: {
    kind: "choice",
    label: "Ink",
    default: "cobalt",
    options: ["cobalt", "rose", "lime"],
    names: { cobalt: "Cobalt", rose: "Rose", lime: "Lime" },
  },
});

const FILE = "q3-meter-report.pdf";

type Render = { done: number; rest: number };

/** One beat of the simulated render: uneven pages, a rest, then again. */
function advance(r: Render): Render {
  if (r.done < 100) {
    // 2 to 8 points a beat, the same run every time.
    const step = 2 + ((r.done * 41 + 3) % 7);
    const done = Math.min(100, r.done + step);
    return { done, rest: done >= 100 ? 9 : 0 };
  }
  return r.rest > 0 ? { ...r, rest: r.rest - 1 } : { done: 0, rest: 0 };
}

/**
 * Gaugeworks rendering a quarterly meter report: the preview is drawn while
 * the report is laid out, and the file row closes its figure as the pages
 * are done.
 */
export function GearedPenDemo({
  chrome = true,
  // The pen is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [render, setRender] = React.useState<Render>({ done: 38, rest: 0 });
  const [turned, setTurned] = React.useState(false);

  React.useEffect(() => {
    let timer = 0;
    const beat = () => {
      timer = window.setTimeout(beat, 300);
      if (!document.hidden) setRender(advance);
    };
    timer = window.setTimeout(beat, 300);
    return () => window.clearTimeout(timer);
  }, []);

  const done = render.done >= 100;

  const scene = (
    <div className="flex w-full max-w-xs flex-col gap-4 self-center">
      <GearedPen
        size={64}
        label="Rendering preview"
        onTurn={() => setTurned(true)}
        {...values}
      />
      <div className="flex items-center gap-2 rounded-2 border border-hairline bg-card px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate text-foreground" title={FILE}>
          {FILE}
        </span>
        <GearedPen
          size={16}
          hideLabel
          disabled
          label={`Rendering ${FILE}`}
          progress={render.done / 100}
          {...values}
        />
        <span className="w-10 shrink-0 text-right font-mono text-xs text-ink-3 tabular-nums">
          {render.done}%
        </span>
      </div>
    </div>
  );

  if (!chrome) return scene;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{done ? "rendered" : "rendering"}</span>
        {done ? " · q3 report ready" : " · q3 meter report"}
        {turned ? " · turned by hand" : " · turn the wheel"}
      </p>
    </div>
  );
}
