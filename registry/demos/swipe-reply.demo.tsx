"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSwipeMessages,
  SwipeReply,
  type SwipeDelivery,
  type SwipeMessage,
} from "@/registry/ui/swipe-reply";

export const tweaks = defineTweaks({
  swipeDistance: {
    kind: "range",
    label: "Pull",
    default: 64,
    min: 40,
    max: 96,
    step: 8,
    unit: "px",
  },
  bubbleStyle: {
    kind: "choice",
    label: "Bubbles",
    default: "tail",
    options: ["tail", "round", "block"],
    names: { tail: "Tail", round: "Round", block: "Block" },
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
      "oklch(from var(--accent-bright) l c 320)": "Iris",
    },
  },
});

const at = (d: number, h: number, m: number) => Date.UTC(2026, 9, d, h, m);

/** Two pages of history behind the thread, oldest page last. */
const HISTORY: SwipeMessage[][] = [
  [
    {
      id: "h3",
      from: "noor",
      text: "Fieldline confirmed the site visit for Thursday.",
      at: at(14, 16, 2),
    },
    {
      id: "h4",
      from: "you",
      text: "Great. Who else is coming?",
      at: at(14, 16, 5),
      status: "read",
    },
    {
      id: "h5",
      from: "noor",
      text: "Just us two, and their facilities lead on site.",
      at: at(14, 16, 9),
    },
  ],
  [
    {
      id: "h1",
      from: "you",
      text: "Did the survey kit ever come back from repair?",
      at: at(13, 11, 40),
      status: "read",
    },
    {
      id: "h2",
      from: "noor",
      text: "Yesterday. All four tablets work again.",
      at: at(13, 11, 52),
    },
  ],
];
const LATE: SwipeMessage = {
  id: "late",
  from: "noor",
  text: "Platform 4, not gate 4. Sorry, still half asleep.",
  at: at(17, 9, 38),
};

/**
 * You and Noor Haddad sorting out a Fieldline site visit. Sending gets a
 * delivered tick after 0.7 s and read after 1.6 s; a message with "fail" in
 * it fails. Scrolling to the top loads two pages of history. In the gallery
 * Noor sends one more message a moment after the card comes into view.
 */
export function SwipeReplyDemo({
  chrome = true,
  // The thread is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [messages, setMessages] =
    React.useState<SwipeMessage[]>(defaultSwipeMessages);
  const [pages, setPages] = React.useState(0);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const timers = React.useRef<number[]>([]);
  const nudged = React.useRef(false);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
    };
  }, []);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const mark = (id: string, status: SwipeDelivery) =>
    setMessages((list) =>
      list.map((m) =>
        m.id === id && m.status !== "failed" ? { ...m, status } : m,
      ),
    );

  // The card gets one more message from Noor, once, when it is first seen.
  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node) return;
    let t = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || nudged.current) return;
      t = window.setTimeout(() => {
        nudged.current = true;
        setMessages((list) =>
          list.some((m) => m.id === LATE.id) ? list : [...list, LATE],
        );
      }, 1200);
    });
    io.observe(node);
    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, [chrome]);

  const thread = (
    <SwipeReply
      key={run}
      messages={messages}
      onMessagesChange={setMessages}
      hasEarlier={pages < HISTORY.length}
      onLoadEarlier={() =>
        new Promise<SwipeMessage[]>((resolve) => {
          later(() => {
            const page = HISTORY[pages] ?? [];
            setPages((p) => p + 1);
            setNote(`history · ${page.length} earlier messages`);
            resolve(page);
          }, 900);
        })
      }
      onSend={(m) =>
        new Promise<void>((resolve, reject) => {
          later(() => {
            if (/fail/i.test(m.text)) {
              setNote("not delivered · retry on the bubble");
              reject(new Error("offline"));
              return;
            }
            resolve();
            setNote(m.replyTo ? "sent · as a reply" : "sent");
            later(() => mark(m.id, "delivered"), 300);
            later(() => {
              mark(m.id, "read");
              setNote("read · noor saw it");
            }, 1200);
          }, 400);
        })
      }
      onReply={(m) =>
        setNote(`reply · quoting ${m.from === "you" ? "yourself" : "noor"}`)
      }
      onReact={(_m, kind, on) =>
        setNote(on ? `reacted · ${kind}` : `reaction removed · ${kind}`)
      }
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={ref} className="w-full">
        {thread}
      </div>
    );

  return (
    <div ref={ref} className="flex w-full max-w-md flex-col gap-4">
      {thread}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current = [];
            setMessages(defaultSwipeMessages);
            setPages(0);
            setNote(null);
            setRun((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <span className="text-signal">{note}</span>
        ) : (
          <>
            <span className="text-signal">swipe a bubble</span> · or focus one
            and press r
          </>
        )}
      </p>
    </div>
  );
}
