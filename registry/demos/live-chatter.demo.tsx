"use client";

import * as React from "react";

import { Lock, Timer, WifiOff } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultLiveChatterMessages,
  defaultLiveChatterNow,
  LiveChatter,
  type LiveChatterBadge,
  type LiveChatterMessage,
} from "@/registry/ui/live-chatter";

export const tweaks = defineTweaks({
  scrollSpeed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
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

const PEOPLE: { name: string; badges?: LiveChatterBadge[] }[] = [
  { name: "Tomas Brandt" },
  { name: "Priya Raman" },
  { name: "Lena Okafor" },
  { name: "Dario Silva" },
  { name: "Hana Sato" },
  { name: "Malia Fern" },
  { name: "Joel Park" },
  { name: "Ayo Bello" },
  { name: "Wren Castillo" },
  { name: "Noor Haddad" },
  { name: "Kenji Ito", badges: ["mod"] },
  { name: "Sana Idris", badges: ["staff"] },
  { name: "Rafi Okafor", badges: ["speaker"] },
  { name: "Ines Marlow", badges: ["host"] },
];

const LINES = [
  "offline mode in November, noted",
  "can we get the slides after",
  "the map demo looked smooth",
  "+1 on board comments",
  "is the tablet app included",
  "hello from Fieldline",
  "audio dipped for a second",
  "back now",
  "that chart is wild",
  "who made the intro music",
  "this is the good stuff",
  "three of three when",
  "@Mara the sync fix made it in",
  "we tested that last sprint",
  "love the new icons",
  "the export bug is fixed too?",
  "agreed with Hana",
  "timeline slide please",
  "Gaugeworks team says hi",
  "notes going in the doc",
  "this answers my Q&A question",
  "nice",
  "ok that is clever",
  "how long is the beta",
  "can guests see shared boards",
  "the coffee in Basin Hall is back",
  "same question as Lena",
  "rollout by region or all at once",
  "is there a recording link yet",
  "the dark theme looks great on the big screen",
];

const STAFF_LINES: Record<LiveChatterBadge, string[]> = {
  mod: [
    "Keep questions in the Q&A tab, please.",
    "Slides go out after the call.",
    "Recording goes up tomorrow.",
  ],
  staff: ["Beta sign-up is in #roadmap", "Docs for offline mode land Monday."],
  speaker: [
    "Three: search across every workspace.",
    "Rollout goes region by region, two weeks apart.",
    "Guests get read access to shared boards.",
  ],
  host: ["Ten more minutes, then open Q&A.", "Thanks for all the questions."],
};

/** A seeded stream: the same names, lines and gaps on every visit. */
function makeFeed(seed: number) {
  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return () => {
    const person = PEOPLE[Math.floor(rand() * PEOPLE.length)] ?? PEOPLE[0]!;
    const badge = person.badges?.[0];
    const pool = badge ? STAFF_LINES[badge] : LINES;
    const text = pool[Math.floor(rand() * pool.length)] ?? LINES[0]!;
    return { person, text, gap: 0.45 + rand() * 1.1 };
  };
}

const MAX_KEPT = 400;

/**
 * The Coldbrook all-hands, two minutes in: the room chats while the Q4
 * roadmap is presented. The stream is simulated here from a seeded script,
 * only while the demo is on screen and the page is visible.
 */
export function LiveChatterDemo({
  chrome = true,
  // The chat is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const speed = values.scrollSpeed ?? 1;
  const [messages, setMessages] = React.useState<LiveChatterMessage[]>(
    defaultLiveChatterMessages,
  );
  const [now, setNow] = React.useState(defaultLiveChatterNow);
  const [connection, setConnection] = React.useState<"live" | "reconnecting">(
    "live",
  );
  const [slow, setSlow] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [event, setEvent] = React.useState<string | null>(null);
  const [visible, setVisible] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement | null>(null);
  const feed = React.useRef<ReturnType<typeof makeFeed> | null>(null);
  const counter = React.useRef(0);
  const missed = React.useRef(0);
  const dropAt = React.useRef(0);
  // The stream's own clock: advanced by each arrival, never read from Date.
  const clock = React.useRef(defaultLiveChatterNow);

  // Only stream while the chat can be seen and the page is in front.
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

  React.useEffect(() => {
    if (!visible) return;
    feed.current ??= makeFeed(1778);
    let timer = 0;
    const tick = () => {
      const next = feed.current!();
      const delay = Math.round((next.gap * 1000) / Math.max(0.25, speed));
      timer = window.setTimeout(() => {
        clock.current += delay;
        if (connection !== "live") {
          missed.current += 1;
        } else {
          counter.current += 1;
          const message: LiveChatterMessage = {
            id: `f${counter.current}`,
            author: next.person.name,
            badges: next.person.badges,
            text: next.text,
            at: clock.current,
          };
          setMessages((list) => {
            const out = [...list, message];
            return out.length > MAX_KEPT ? out.slice(-MAX_KEPT) : out;
          });
          setNow(clock.current);
        }
        tick();
      }, delay);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [visible, speed, connection]);

  // A dropped connection comes back after three seconds with a gap marker.
  React.useEffect(() => {
    if (connection === "live") return;
    const t = window.setTimeout(() => {
      const lost = missed.current;
      missed.current = 0;
      counter.current += 1;
      const gap: LiveChatterMessage = {
        id: `gap${counter.current}`,
        author: "",
        text: "",
        kind: "gap",
        missed: Math.max(1, lost),
        at: dropAt.current,
        until: clock.current,
      };
      setMessages((list) => [...list, gap]);
      setNow(clock.current);
      setConnection("live");
      setEvent(`reconnected · missed ${Math.max(1, lost)}`);
    }, 3000);
    return () => window.clearTimeout(t);
  }, [connection]);

  const surface = (
    <LiveChatter
      messages={messages}
      now={now}
      connection={connection}
      slowMode={slow ? 10 : 0}
      muted={muted}
      mutedUntil={muted ? now + 15 * 60_000 : undefined}
      mutedReason={
        muted ? "Links aren't allowed in the all-hands chat." : undefined
      }
      viewerName="Mara Quinn"
      onPause={(on, reason) => {
        setPaused(on);
        setEvent(on ? `paused · ${reason}` : `live · ${reason}`);
      }}
      onSend={(text) => {
        counter.current += 1;
        clock.current += 400;
        const mine: LiveChatterMessage = {
          id: `you${counter.current}`,
          author: "Mara Quinn",
          text,
          at: clock.current,
        };
        setMessages((list) => [...list, mine]);
        setNow(clock.current);
        setEvent("sent");
      }}
      onReport={(m) => setEvent(`reported · ${m.author.split(" ")[0]}`)}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={wrap} className="w-full max-w-sm">
        {surface}
      </div>
    );
  }

  const button = (on: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-2 border px-3 text-xs transition-colors outline-none",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      on
        ? "border-hairline-strong bg-surface-2 text-foreground"
        : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
    );

  const count = messages.filter(
    (m) => (m.kind ?? "message") === "message",
  ).length;

  return (
    <div ref={wrap} className="flex w-full max-w-sm flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button(connection !== "live")}
          aria-pressed={connection !== "live"}
          onClick={() => {
            if (connection !== "live") return;
            dropAt.current = clock.current;
            missed.current = 0;
            setConnection("reconnecting");
            setEvent("connection dropped");
          }}
        >
          <WifiOff aria-hidden className="size-3.5" />
          Drop
        </button>
        <button
          type="button"
          className={button(slow)}
          aria-pressed={slow}
          onClick={() => {
            setSlow((v) => !v);
            setEvent(slow ? "slow mode off" : "slow mode · 10 s");
          }}
        >
          <Timer aria-hidden className="size-3.5" />
          Slow mode
        </button>
        <button
          type="button"
          className={button(muted)}
          aria-pressed={muted}
          onClick={() => {
            setMuted((v) => !v);
            setEvent(muted ? "unmuted" : "muted · 15 min");
          }}
        >
          <Lock aria-hidden className="size-3.5" />
          Mute
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {event ??
            (connection !== "live"
              ? "reconnecting"
              : paused
                ? "paused"
                : "live")}
        </span>{" "}
        · {count} messages · 1,284 watching
      </p>
    </div>
  );
}
