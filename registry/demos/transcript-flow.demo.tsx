"use client";

import * as React from "react";

import {
  TranscriptFlow,
  type TranscriptSegment,
} from "@/registry/ui/transcript-flow";

/** A scripted dictation: each step replaces its own segment or adds a new one. */
const STEPS: TranscriptSegment[] = [
  { id: "s1", text: "Bay four is", final: false },
  { id: "s1", text: "Bay four is reading", final: false },
  { id: "s1", text: "Bay four is reading long", final: false },
  { id: "s1", text: "Bay four is reading two degrees long.", final: true },
  { id: "s2", text: "Retorque to", final: false },
  { id: "s2", text: "Retorque to eighteen", final: false },
  { id: "s2", text: "Re-torque to eighteen newton metres", final: false },
  {
    id: "s2",
    text: "Re-torque to eighteen newton metres and log the drift.",
    final: true,
  },
  { id: "s3", text: "Hand the bay", final: false },
  { id: "s3", text: "Hand the bay over at", final: false },
  { id: "s3", text: "Hand the bay over at shift change.", final: true },
];

/** The specimen opens on one finished sentence rather than an empty box. */
const SEED = 4;

const CONTROL =
  "flex h-8 flex-1 cursor-pointer items-center justify-center rounded-2 border border-hairline px-3 text-xs font-medium transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function TranscriptFlowDemo() {
  const [step, setStep] = React.useState(SEED);
  const [listening, setListening] = React.useState(false);
  const stepRef = React.useRef(SEED);

  const segments = React.useMemo(() => {
    const out: TranscriptSegment[] = [];
    for (const entry of STEPS.slice(0, step)) {
      const at = out.findIndex((segment) => segment.id === entry.id);
      if (at >= 0) out[at] = entry;
      else out.push(entry);
    }
    return out;
  }, [step]);

  // Nothing ticks until the button says so, and the run stops itself at the
  // end of the script rather than leaving a timer looping on nothing.
  React.useEffect(() => {
    if (!listening) return;
    const timer = window.setInterval(() => {
      const next = stepRef.current + 1;
      stepRef.current = next;
      setStep(next);
      if (next >= STEPS.length) setListening(false);
    }, 650);
    return () => window.clearInterval(timer);
  }, [listening]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TranscriptFlow
        label="Fieldline dictation"
        segments={segments}
        listening={listening}
        maxHeight={160}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (stepRef.current >= STEPS.length) {
              stepRef.current = SEED;
              setStep(SEED);
            }
            setListening(!listening);
          }}
          className={CONTROL}
        >
          {listening ? "Pause" : "Start"}
        </button>
        <button
          type="button"
          onClick={() => {
            stepRef.current = SEED;
            setStep(SEED);
            setListening(false);
          }}
          className={CONTROL}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {listening ? "Listening" : "Paused"}
        </span>{" "}
        · <span className="tabular-nums">{segments.length}</span> segments
      </p>
    </div>
  );
}
