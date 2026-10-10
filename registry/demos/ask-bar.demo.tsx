"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AskBar, type AskBarAttachment } from "@/registry/ui/ask-bar";

export const tweaks = defineTweaks({
  rows: {
    kind: "range",
    label: "Rows",
    default: 5,
    min: 2,
    max: 8,
    step: 1,
  },
  cycle: {
    kind: "range",
    label: "Cycle",
    default: 3,
    min: 0,
    max: 6,
    step: 0.5,
    unit: "s",
  },
  lift: {
    kind: "range",
    label: "Lift",
    default: 12,
    min: 0,
    max: 24,
    step: 4,
    unit: "px",
  },
});

const PLACEHOLDERS = [
  "Ask Fernworks about your plants",
  "Why are my fern's fronds browning?",
  "How often should I water a calathea?",
  "Which plants like a north window?",
];

const SPARE: AskBarAttachment[] = [
  { id: "soil", name: "soil-test.pdf", meta: "84 KB" },
  { id: "window", name: "window-light.jpg", meta: "1.4 MB" },
  { id: "notes", name: "care-notes.txt", meta: "2 KB" },
];

const ANSWERS = [
  "Boston ferns like bright, indirect light and evenly moist soil. Mist the fronds in dry rooms and keep them away from radiators.",
  "Yellow lower fronds usually mean too much water. Let the top two centimetres dry before watering, and check that the pot drains freely.",
  "Repot in spring, one size up, with a peat-free mix and a handful of bark so the roots get air.",
];

/** How long the demo "thinks" before it answers, and its pace per word, in ms. */
const WAIT = 1100;
const WORD = 70;

type Phase = "ready" | "asked" | "answering" | "answered" | "stopped";

/**
 * Fernworks plant help: a photo is already attached, the placeholder rolls
 * through questions people ask, and a sent question lifts into its bubble
 * while a short answer streams in under it.
 */
export function AskBarDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [draft, setDraft] = React.useState("");
  const [files, setFiles] = React.useState<AskBarAttachment[]>([
    { id: "photo", name: "fern-photo.jpg", meta: "2.1 MB" },
  ]);
  const [busy, setBusy] = React.useState(false);
  const [words, setWords] = React.useState<string[] | null>(null);
  const [phase, setPhase] = React.useState<Phase>("ready");
  const asked = React.useRef(0);
  const timer = React.useRef(0);

  const stopTimer = () => window.clearTimeout(timer.current);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const onSubmit = () => {
    const answer = ANSWERS[asked.current % ANSWERS.length] ?? "";
    asked.current += 1;
    setFiles([]);
    setBusy(true);
    setWords([]);
    setPhase("asked");
    stopTimer();
    const all = answer.split(" ");
    const stream = (n: number) => {
      setWords(all.slice(0, n));
      if (n >= all.length) {
        setBusy(false);
        setPhase("answered");
        return;
      }
      timer.current = window.setTimeout(() => stream(n + 1), WORD);
    };
    timer.current = window.setTimeout(() => {
      setPhase("answering");
      stream(1);
    }, WAIT);
  };

  const bar = (
    <AskBar
      label="Ask Fernworks"
      value={draft}
      onValueChange={setDraft}
      onSubmit={onSubmit}
      busy={busy}
      onStop={() => {
        stopTimer();
        setBusy(false);
        setPhase("stopped");
      }}
      answer={
        words === null ? undefined : words.length === 0 ? (
          <span className="text-ink-3">Looking at your photo…</span>
        ) : (
          words.join(" ")
        )
      }
      attachments={files}
      onAttach={() => {
        const next = SPARE.find((f) => !files.some((g) => g.id === f.id));
        if (next) setFiles((prev) => [...prev, next]);
      }}
      onRemoveAttachment={(id) =>
        setFiles((prev) => prev.filter((f) => f.id !== id))
      }
      placeholders={PLACEHOLDERS}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full max-w-md justify-center">{bar}</div>;
  }

  const count = words?.length ?? 0;
  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {bar}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {phase === "ready" ? (
          <>
            <span className="text-signal">ready</span> · enter sends,
            shift+enter for a line
          </>
        ) : phase === "asked" || phase === "answering" ? (
          <>
            <span className="text-signal">asked</span> · answering…
          </>
        ) : phase === "stopped" ? (
          <>
            <span className="text-signal">stopped</span> · {count}{" "}
            {count === 1 ? "word" : "words"} in
          </>
        ) : (
          <>
            <span className="text-signal">answered</span> · {count} words
          </>
        )}
      </p>
    </div>
  );
}
