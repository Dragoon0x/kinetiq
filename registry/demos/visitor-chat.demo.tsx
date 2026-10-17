"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { VisitorChat, type ChatMessage } from "@/registry/ui/visitor-chat";

export const tweaks = defineTweaks({
  launcherShape: {
    kind: "choice",
    label: "Launcher",
    default: "circle",
    options: ["circle", "squircle", "pill"],
    names: { circle: "Circle", squircle: "Squircle", pill: "Pill" },
  },
  bubbleStyle: {
    kind: "choice",
    label: "Bubbles",
    default: "tinted",
    options: ["tinted", "solid", "minimal"],
    names: { tinted: "Tinted", solid: "Solid", minimal: "Minimal" },
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

/** Friday 14:20 UTC, the team is in; Saturday 11:00, it is away. */
const IN_HOURS = Date.UTC(2026, 9, 16, 14, 20);
const AWAY = Date.UTC(2026, 9, 17, 11, 0);

const REPLIES = [
  "Thanks for the detail. Let me look at your workspace.",
  "You can rotate the signing secret under Settings, then Webhooks. Old deliveries keep verifying for 24 hours.",
  "Retries back off for up to three days. Each attempt shows in the delivery log with its response code.",
  "That should do it. Anything else on webhooks?",
];
const OPENER = "Hi there. Anything I can help with on webhooks today?";

/** A slice of the Waylight docs, behind the widget. */
function DocsPage() {
  return (
    <div aria-hidden className="h-full overflow-hidden p-5 select-none">
      <p className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">
        Waylight docs · API
      </p>
      <p className="mt-2 text-[22px] leading-7 font-semibold tracking-[-0.01em] text-foreground">
        Webhooks
      </p>
      <p className="mt-2 max-w-md text-[13px] leading-5 text-ink-2">
        Waylight sends an HTTPS request to your endpoint whenever something
        changes in a workspace. Each delivery is signed, so you can check it
        came from us.
      </p>
      <div className="mt-4 max-w-md rounded-3 border border-hairline bg-surface-1 p-3 font-mono text-[11px] leading-5 text-ink-2">
        <p>
          <span className="text-ink-3">POST</span> /hooks/waylight
        </p>
        <p>waylight-signature: t=1792…, v1=9f3c…</p>
        <p className="text-ink-3">{'{ "event": "page.published" }'}</p>
      </div>
      <p className="mt-4 max-w-md text-[13px] leading-5 text-ink-2">
        Failed deliveries are retried with backoff. Rotate the signing secret
        from Settings whenever you need to.
      </p>
    </div>
  );
}

/**
 * The Waylight docs with the help team in the corner. Sending makes Ines
 * reply after a moment of typing; a message with "fail" in it is refused, so
 * its bubble keeps a retry. In the gallery the window opens itself once and
 * Ines says hello.
 */
export function VisitorChatDemo({
  chrome = true,
  // The widget is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [typing, setTyping] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [inHours, setInHours] = React.useState(true);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const timers = React.useRef<number[]>([]);
  const replies = React.useRef(0);
  const greeted = React.useRef(false);
  const now = inHours ? IN_HOURS : AWAY;

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
    };
  }, []);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /** Ines types for a moment, then her reply replaces the dots. */
  const reply = (text: string, at: number) => {
    later(() => setTyping("ines"), 900);
    later(() => {
      setTyping(null);
      setMessages((list) => [
        ...list.map((m) =>
          m.from === "visitor" && m.status === "sent"
            ? { ...m, status: "seen" as const }
            : m,
        ),
        { id: `r${at}-${list.length}`, from: "ines", text, at: at + 60_000 },
      ]);
      setNote("reply · seen by ines");
    }, 2500);
  };

  // The card opens itself once when it is first seen, and Ines says hello.
  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node) return;
    let t1 = 0;
    let t2 = 0;
    let t3 = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || greeted.current) return;
      t1 = window.setTimeout(() => {
        greeted.current = true;
        setOpen(true);
        t2 = window.setTimeout(() => setTyping("ines"), 1100);
        t3 = window.setTimeout(() => {
          setTyping(null);
          setMessages((list) =>
            list.length
              ? list
              : [{ id: "hello", from: "ines", text: OPENER, at: IN_HOURS }],
          );
        }, 2700);
      }, 500);
    });
    io.observe(node);
    return () => {
      io.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [chrome]);

  const widget = (
    <VisitorChat
      key={run}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setNote(o ? "window open" : "window closed");
      }}
      messages={messages}
      onMessagesChange={setMessages}
      typing={typing}
      now={now}
      onSend={(m, meta) =>
        new Promise<void>((resolve, reject) => {
          window.setTimeout(() => {
            if (/fail/i.test(m.text)) {
              setNote("send failed · retry on the bubble");
              reject(new Error("offline"));
              return;
            }
            resolve();
            if (meta.email && !inHours) {
              setNote(`sent · reply goes to ${meta.email}`);
              return;
            }
            setNote("sent · ines is reading");
            const text = REPLIES[replies.current % REPLIES.length] ?? "";
            replies.current += 1;
            reply(text, now);
          }, 500);
        })
      }
      onAttach={(files) =>
        setNote(`attached · ${files[0]?.name.toLowerCase() ?? "file"}`)
      }
      {...values}
    >
      <DocsPage />
    </VisitorChat>
  );

  if (!chrome)
    return (
      <div ref={ref} className="w-full">
        {widget}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {widget}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={inHours}
          onClick={() => {
            setInHours((v) => !v);
            setNote(inHours ? "away · asks for an email" : "office hours");
          }}
          className={button}
        >
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full",
              inHours ? "bg-success" : "bg-ink-3",
            )}
          />
          Office hours
        </button>
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current = [];
            setMessages([]);
            setTyping(null);
            setOpen(false);
            setInHours(true);
            setNote(null);
            replies.current = 0;
            setRun((r) => r + 1);
          }}
          className={button}
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
            <span className="text-signal">waylight help</span> · press the
            launcher in the corner
          </>
        )}
      </p>
    </div>
  );
}
