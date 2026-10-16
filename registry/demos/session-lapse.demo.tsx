"use client";

import * as React from "react";

import { BellRing, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { SessionLapse } from "@/registry/ui/session-lapse";

export const tweaks = defineTweaks({
  ringStyle: {
    kind: "choice",
    label: "Ring",
    default: "line",
    options: ["line", "ticks", "pie"],
    names: { line: "Line", ticks: "Ticks", pie: "Pie" },
  },
  warningTime: {
    kind: "range",
    label: "Warning",
    default: 15000,
    min: 10000,
    max: 60000,
    step: 5000,
    unit: "ms",
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "calm",
    options: ["calm", "plain", "urgent"],
    names: { calm: "Calm", plain: "Plain", urgent: "Urgent" },
  },
});

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const NOTES =
  "Transect 4 flooded after the storm; moved the quadrats 30 m upslope and re-pinned the markers. Sedge cover down to a third. Recheck the culvert on Thursday.";

/** Idle time after the warning's window, before it appears. */
const QUIET = 6000;

/**
 * A Fernworks field-notes draft with autosave off — the case a lapse would
 * cost. The session is short here: six quiet seconds, then the warning. In
 * the gallery the warning is already up on the first frame, and the scene
 * starts over a few seconds after it ends.
 */
export function SessionLapseDemo({
  chrome = true,
  // The guard is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  warningTime = 15000,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const uid = React.useId();
  const [round, setRound] = React.useState(0);
  const [startOpen, setStartOpen] = React.useState(!chrome);
  const [text, setText] = React.useState(NOTES);
  const [note, setNote] = React.useState(
    chrome ? "idle clock running" : "warning showing",
  );
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const restart = (open: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setStartOpen(open);
    setText(NOTES);
    setNote(open ? "warning showing" : "idle clock running");
    setRound((r) => r + 1);
  };
  // The gallery card loops: a few seconds on the note, then back to the top.
  const loopSoon = (ms: number) => {
    if (chrome) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => restart(true), ms);
  };

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const page = (
    <div className="flex w-full flex-col overflow-hidden rounded-3 border border-hairline bg-card text-card-foreground">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-2">
        <span className="min-w-0 truncate text-[13px] leading-5 font-semibold">
          Q3 survey notes
        </span>
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
          Not saved
        </span>
      </div>
      <label htmlFor={`${uid}-notes`} className="sr-only">
        Field notes
      </label>
      <textarea
        id={`${uid}-notes`}
        value={text}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setText(value);
        }}
        rows={4}
        className="w-full resize-none bg-transparent px-3 py-2.5 text-[12px] leading-5 text-ink-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      />
      <div className="flex items-center justify-between gap-3 border-t border-hairline px-3 py-2 font-mono text-[10px] text-ink-3 tabular-nums">
        <span>{words} words</span>
        <span>Autosave off</span>
      </div>
    </div>
  );

  const surface = (
    <SessionLapse
      key={round}
      defaultOpen={startOpen}
      timeout={warningTime + QUIET}
      warningTime={warningTime}
      watch="self"
      appName="Fernworks"
      draft={{
        title: "Q3 survey notes",
        excerpt: text.trim() || "Empty draft",
        words,
      }}
      onOpenChange={(open) => {
        if (open) setNote(`warning · ${Math.round(warningTime / 1000)} s`);
      }}
      onExtend={(via) => setNote(`extended by ${via}`)}
      onExpire={() => {
        setNote("signed out · draft kept");
        loopSoon(6000);
      }}
      onSignOut={() => {
        setNote("signed out by you · draft kept");
        loopSoon(6000);
      }}
      onSignIn={() => {
        setNote("signed back in · idle clock running");
        loopSoon(3000);
      }}
      {...values}
    >
      {page}
    </SessionLapse>
  );

  if (!chrome) return <div className="w-full max-w-sm">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
    FOCUS,
  );

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="w-full self-center">{surface}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => restart(true)} className={button}>
          <BellRing aria-hidden className="size-3.5" />
          Warn now
        </button>
        <button type="button" onClick={() => restart(false)} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{note}</span> · Fernworks
      </p>
    </div>
  );
}
