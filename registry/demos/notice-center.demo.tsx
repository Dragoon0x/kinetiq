"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultNoticeNow,
  defaultNotices,
  defaultNoticeSources,
  NoticeCenter,
  type Notice,
} from "@/registry/ui/notice-center";

export const tweaks = defineTweaks({
  stack: {
    kind: "choice",
    label: "Stack",
    default: "deck",
    options: ["deck", "fan", "flat"],
    names: { deck: "Deck", fan: "Fan", flat: "Flat" },
  },
  sweep: {
    kind: "range",
    label: "Sweep",
    default: 480,
    min: 200,
    max: 800,
    step: 40,
    unit: "ms",
  },
  group: {
    kind: "choice",
    label: "Group",
    default: "source",
    options: ["source", "day", "off"],
    names: { source: "By source", day: "By day", off: "None" },
  },
});

/** Seeded test notices, sent in turn. */
const TESTS: Omit<Notice, "id" | "at">[] = [
  {
    source: "monitor",
    title: "Error rate above 2%",
    body: "checkout-api returned 5xx on 2.4% of requests over two minutes.",
  },
  {
    source: "builds",
    title: "Deploy finished",
    body: "gauge-ingest · main to production in 1m 41s.",
  },
  {
    source: "pay",
    title: "Payout scheduled",
    body: "€1,904.12 to Coldbrook Bank ••42 on Friday.",
  },
];

/** The demo's clock moves a minute every few seconds, so times age visibly. */
const TICK_MS = 6000;

const nameOf = (id: string) =>
  defaultNoticeSources.find((s) => s.id === id)?.name.toLowerCase() ??
  "a source";

/**
 * The bell of a Fieldline workspace on a Tuesday afternoon: builds, payouts,
 * bank statements, monitoring alerts and mentions.
 */
export function NoticeCenterDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [notices, setNotices] = React.useState<Notice[]>(defaultNotices);
  const [now, setNow] = React.useState(defaultNoticeNow);
  const [note, setNote] = React.useState<string | null>(null);
  const sent = React.useRef(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // Runs only while the demo is on screen and the page is visible.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    let timer: number | null = null;
    let inView = false;
    const sync = () => {
      const want = inView && !document.hidden;
      if (want && timer === null) {
        timer = window.setInterval(() => setNow((t) => t + 60_000), TICK_MS);
      } else if (!want && timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const io = new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting);
      sync();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      if (timer !== null) window.clearInterval(timer);
    };
  }, []);

  const center = (
    <NoticeCenter
      notices={notices}
      onNoticesChange={setNotices}
      now={now}
      onOpen={(id) => {
        const n = notices.find((x) => x.id === id);
        if (n) setNote(`opened “${n.title}”`);
      }}
      onDismiss={(ids) => {
        const first = notices.find((x) => x.id === ids[0]);
        setNote(
          ids.length === 1
            ? `dismissed “${first?.title ?? "a notice"}”`
            : `dismissed ${ids.length} from ${first ? nameOf(first.source) : "a source"}`,
        );
      }}
      onMarkAllRead={(ids) => setNote(`marked ${ids.length} read`)}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={rootRef} className="w-full">
        {center}
      </div>
    );
  }

  const unread = notices.filter((n) => !n.read).length;

  return (
    <div ref={rootRef} className="flex w-full max-w-6xl flex-col gap-4">
      {center}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">{unread} unread</span> ·{" "}
              {notices.length} {notices.length === 1 ? "notice" : "notices"}
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const t = TESTS[sent.current % TESTS.length];
              sent.current += 1;
              if (!t) return;
              setNotices((list) => [
                { ...t, id: `test-${sent.current}`, at: now },
                ...list,
              ]);
              setNote(`sent “${t.title}”`);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Send a test notice
          </button>
          <button
            type="button"
            onClick={() => {
              setNotices(defaultNotices);
              setNow(defaultNoticeNow);
              setNote(null);
              sent.current = 0;
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
