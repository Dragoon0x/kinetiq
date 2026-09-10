"use client";

import * as React from "react";

import { CallQuality, type CallQualityState } from "@/registry/ui/call-quality";

type Frame = {
  level: number;
  state: CallQualityState;
  rtt: number;
  loss: number;
  jitter: number;
};

const HEAD: Frame = { level: 4, state: "live", rtt: 38, loss: 0.1, jitter: 6 };

/** A seeded script of one call degrading, dropping and coming back. */
const SCRIPT: Frame[] = [
  HEAD,
  { level: 3, state: "live", rtt: 62, loss: 0.4, jitter: 9 },
  { level: 2, state: "live", rtt: 118, loss: 1.6, jitter: 17 },
  { level: 1, state: "live", rtt: 184, loss: 3.9, jitter: 26 },
  { level: 0, state: "reconnecting", rtt: 210, loss: 4.8, jitter: 31 },
  { level: 0, state: "reconnecting", rtt: 236, loss: 5.2, jitter: 34 },
  { level: 0, state: "lost", rtt: 240, loss: 6.1, jitter: 36 },
  { level: 2, state: "live", rtt: 132, loss: 1.2, jitter: 15 },
  { level: 3, state: "live", rtt: 71, loss: 0.5, jitter: 8 },
];

const control =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function CallQualityDemo() {
  const [index, setIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [line, setLine] = React.useState("the line is good");

  const indexRef = React.useRef(index);
  React.useEffect(() => {
    indexRef.current = index;
  });

  React.useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      // A hidden tab watches nothing, so the script waits rather than racing.
      if (document.hidden) return;
      setIndex((indexRef.current + 1) % SCRIPT.length);
    }, 1100);
    return () => window.clearInterval(id);
  }, [playing]);

  const frame = SCRIPT[index] ?? HEAD;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CallQuality
        label="Line to Coldbrook dispatch"
        level={frame.level}
        state={frame.state}
        rttMs={frame.rtt}
        lossPercent={frame.loss}
        jitterMs={frame.jitter}
        dropNote="Ines dropped for six seconds on the yard relay."
        onGradeChange={(sentence) => setLine(sentence.toLowerCase())}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((was) => !was)}
          className={control}
        >
          {playing ? "Pause the drop" : "Run the drop"}
        </button>
        <button
          type="button"
          onClick={() => setIndex((was) => (was + 1) % SCRIPT.length)}
          className={control}
        >
          Step
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setIndex(0);
          }}
          className={control}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {frame.rtt} ms · {frame.loss.toFixed(1)}% loss ·{" "}
        <span className="text-signal">{line}</span>
      </p>
    </div>
  );
}
