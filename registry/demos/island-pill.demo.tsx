"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  IslandPill,
  type IslandPillAction,
  type IslandPillNotice,
} from "@/registry/ui/island-pill";

export const tweaks = defineTweaks({
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 380,
    min: 200,
    max: 600,
    step: 20,
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  expand: { kind: "toggle", label: "Expand", default: false },
  state: {
    kind: "choice",
    label: "State",
    default: "timer",
    options: ["timer", "upload", "call"],
    names: { timer: "Timer", upload: "Upload", call: "Call" },
  },
});

const FIRST: IslandPillNotice[] = [
  {
    id: "split",
    title: "Split 4 was your fastest",
    body: "4:02 per km, 6 s under goal",
    tone: "success",
  },
  {
    id: "rain",
    title: "Rain from 18:00",
    body: "Tomorrow's long run moved to 07:00",
    tone: "warn",
  },
];

const MORE: Omit<IslandPillNotice, "id">[] = [
  { title: "Ines liked your run", body: "Tempo, 6 × 800 m" },
  { title: "Heart rate high", body: "178 bpm for 3 minutes", tone: "danger" },
  { title: "Route synced", body: "Riverside loop, 8.4 km", tone: "success" },
  {
    title: "Shoes at 480 km",
    body: "Time to rotate your trainers",
    tone: "warn",
  },
];

const SPLITS = ["4:08", "4:06", "4:03", "4:02"];

const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Most notices the demo keeps; older ones fall away as new ones come. */
const MOST = 6;

/**
 * Fieldline, mid-run: the island carries the run's timer, the route file
 * going up, or a call from the coach, and the run's notices arrive in it.
 */
export function IslandPillDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const state = values.state ?? "timer";
  const [notices, setNotices] = React.useState<IslandPillNotice[]>(FIRST);
  const [sent, setSent] = React.useState(0);
  const [open, setOpen] = React.useState(values.expand ?? false);
  // The Expand tweak opens and closes the island without a report; the
  // status line follows it all the same.
  const [expandWas, setExpandWas] = React.useState(values.expand);
  if (values.expand !== expandWas) {
    setExpandWas(values.expand);
    setOpen(values.expand ?? false);
  }
  const [seconds, setSeconds] = React.useState(767);
  const [paused, setPaused] = React.useState(false);
  const [laps, setLaps] = React.useState(3);
  const [progress, setProgress] = React.useState(0.64);
  const [uploadPaused, setUploadPaused] = React.useState(false);
  const [connected, setConnected] = React.useState(false);
  const [missed, setMissed] = React.useState(false);
  const [talk, setTalk] = React.useState(0);
  const [last, setLast] = React.useState<string | null>(null);

  // The run's clock, the upload and the call tick only while they are
  // showing and the page can be seen.
  const ticking =
    (state === "timer" && !paused) ||
    (state === "upload" && !uploadPaused && progress < 1) ||
    (state === "call" && connected);
  React.useEffect(() => {
    if (!ticking) return;
    const every = state === "upload" ? 500 : 1000;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (state === "timer") setSeconds((s) => s + 1);
      else if (state === "upload")
        setProgress((p) => Math.min(1, Number((p + 0.01).toFixed(2))));
      else setTalk((t) => t + 1);
    }, every);
    return () => window.clearInterval(timer);
  }, [ticking, state]);

  const act = (action: IslandPillAction) => {
    switch (action) {
      case "pause":
        if (state === "timer") setPaused(true);
        else setUploadPaused(true);
        setLast(state === "timer" ? "run paused" : "upload paused");
        return;
      case "resume":
        if (state === "timer") setPaused(false);
        else setUploadPaused(false);
        setLast(state === "timer" ? "run resumed" : "upload resumed");
        return;
      case "lap":
        setLaps((l) => l + 1);
        setLast(`lap ${laps + 1} at ${clock(seconds)}`);
        return;
      case "stop":
        setPaused(true);
        setSeconds(0);
        setLast("run stopped");
        return;
      case "cancel":
        setUploadPaused(true);
        setProgress(0);
        setLast("upload cancelled");
        return;
      case "answer":
        setConnected(true);
        setMissed(false);
        setTalk(0);
        setLast("call answered");
        return;
      case "decline":
        setMissed(true);
        setLast("call declined");
        return;
      case "end":
        setConnected(false);
        setMissed(false);
        setLast("call ended");
        return;
    }
  };

  const island = (
    <IslandPill
      label="Fieldline live activity"
      notices={notices}
      onDismiss={(id) => setNotices((list) => list.filter((n) => n.id !== id))}
      timer={{ label: "Tempo run", seconds, paused }}
      upload={{
        name: "riverside-loop.gpx",
        progress,
        paused: uploadPaused,
      }}
      call={{
        caller: "Coach Rui Tavares",
        detail: connected
          ? `On call · ${clock(talk)}`
          : missed
            ? "Missed call"
            : "Incoming call",
        connected,
      }}
      onAction={act}
      onExpandChange={setOpen}
      sound={sound}
      {...values}
      className="rounded-4 border border-hairline bg-surface-0"
    >
      <div className="px-3 pb-3">
        <div className="rounded-3 border border-hairline bg-card px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium text-foreground">
              Tempo run
            </p>
            <p className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Fieldline · today
            </p>
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-3">
            6 × 800 m at 4:05 per km, 90 s jog between
          </p>
          <ol className="mt-3 grid grid-cols-4 gap-2">
            {SPLITS.map((split, i) => (
              <li
                key={split}
                className="rounded-2 bg-surface-2 px-2 py-1.5 text-center"
              >
                <span className="block font-mono text-[10px] text-ink-3">
                  {i + 1}
                </span>
                <span className="block font-mono text-xs text-foreground tabular-nums">
                  {split}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </IslandPill>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-lg justify-center">{island}</div>;
  }

  const next = MORE[sent % MORE.length] as Omit<IslandPillNotice, "id">;
  const now =
    state === "timer"
      ? `timer ${paused ? "paused" : "running"} · ${clock(seconds)}`
      : state === "upload"
        ? `upload ${Math.round(progress * 100)}%${uploadPaused ? " · paused" : ""}`
        : connected
          ? `on call · ${clock(talk)}`
          : missed
            ? "call missed"
            : "call ringing";

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      {island}
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={() => {
            setNotices((list) =>
              [...list, { ...next, id: `sent-${sent}` }].slice(-MOST),
            );
            setSent((s) => s + 1);
            setLast(`sent: ${next.title.toLowerCase()}`);
          }}
          className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Send one
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{open ? "island open" : now}</span>
        {" · "}
        {last ??
          (notices.length === 1 ? "1 notice" : `${notices.length} notices`)}
      </p>
    </div>
  );
}
