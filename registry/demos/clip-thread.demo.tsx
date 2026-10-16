"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  ClipThread,
  defaultClipNow,
  defaultClips,
  type ClipThreadClip,
} from "@/registry/ui/clip-thread";

export const tweaks = defineTweaks({
  thumbShape: {
    kind: "choice",
    label: "Thumbs",
    default: "wide",
    options: ["wide", "square", "round"],
    names: { wide: "Wide", square: "Square", round: "Round" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/** A recorded reply: short, about the flow, processing when it arrives. */
const recorded = (n: number, replyTo?: string): ClipThreadClip => ({
  id: `new${n}`,
  author: "Mara Quinn",
  role: "Support",
  at: defaultClipNow + n * 60_000,
  duration: 14,
  title: replyTo ? "Reply" : "From support",
  scene: n % 2 ? "settings" : "flow",
  replyTo,
  processing: 0,
  transcript: [
    { at: 0, text: "Support view: invites failing is our top ticket." },
    { at: 6, text: "Background sending would cut most of them." },
  ],
  reactions: [],
});

/**
 * The Fernworks onboarding flow, reviewed in video: five clips from four
 * people, one still processing. Recording or replying adds a clip that
 * processes while you watch (only while the demo is on screen).
 */
export function ClipThreadDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [clips, setClips] = React.useState<ClipThreadClip[]>(defaultClips);
  const [playing, setPlaying] = React.useState(false);
  const [selected, setSelected] = React.useState("k1");
  const [event, setEvent] = React.useState<string | null>(null);
  const [visible, setVisible] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement | null>(null);
  const made = React.useRef(0);

  React.useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    let inView = false;
    const update = () =>
      setVisible(inView && document.visibilityState === "visible");
    const io = new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting);
      update();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", update);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const busy = clips.some((c) => c.processing !== undefined);

  // Processing advances only while someone can see it.
  React.useEffect(() => {
    if (!visible || !busy) return;
    const id = window.setInterval(() => {
      setClips((list) =>
        list.map((c) => {
          if (c.processing === undefined) return c;
          const next = Math.round((c.processing + 0.05) * 100) / 100;
          if (next >= 1) {
            const done = { ...c };
            delete done.processing;
            return done;
          }
          return { ...c, processing: next };
        }),
      );
    }, 260);
    return () => window.clearInterval(id);
  }, [visible, busy]);

  const add = (replyTo?: string) => {
    made.current += 1;
    const clip = recorded(made.current, replyTo);
    setClips((list) => [...list, clip]);
  };

  const reset = () => {
    made.current = 0;
    setClips(defaultClips);
    setPlaying(false);
    setSelected("k1");
    setEvent(null);
    setRound((r) => r + 1);
  };

  const current = clips.find((c) => c.id === selected);

  const surface = (
    <ClipThread
      key={round}
      clips={clips}
      selected={selected}
      onSelectedChange={(id) => {
        setSelected(id);
        const c = clips.find((x) => x.id === id);
        setEvent(c ? `clip · ${c.author.split(" ")[0]}` : null);
      }}
      playing={playing}
      onPlayingChange={(on) => {
        setPlaying(on);
        setEvent(null);
      }}
      onRecord={() => {
        add();
        setEvent("recorded · processing");
      }}
      onReply={(id) => {
        add(id);
        const c = clips.find((x) => x.id === id);
        setEvent(`reply to ${c?.author.split(" ")[0] ?? "clip"} · processing`);
      }}
      onReact={(_id, kind, at, on) =>
        setEvent(
          `${on ? kind : `${kind} removed`} · ${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, "0")}`,
        )
      }
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={wrap} className="w-full">
        {surface}
      </div>
    );
  }

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );
  const processing = clips.filter((c) => c.processing !== undefined).length;

  return (
    <div ref={wrap} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {event ??
            (playing && current
              ? `playing · ${current.author}`
              : current
                ? `paused · ${current.author}`
                : "ready")}
        </span>{" "}
        · {clips.length} clips
        {processing ? ` · ${processing} processing` : ""}
      </p>
    </div>
  );
}
