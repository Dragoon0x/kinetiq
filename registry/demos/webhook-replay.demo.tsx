"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultWebhookDeliveries,
  WebhookReplay,
  type WebhookDelivery,
  type WebhookReplayResult,
} from "@/registry/ui/webhook-replay";

export const tweaks = defineTweaks({
  chipStyle: {
    kind: "choice",
    label: "Status",
    default: "pill",
    options: ["pill", "tag", "dot"],
    names: { pill: "Pill", tag: "Tag", dot: "Dot" },
  },
  payloadTheme: {
    kind: "choice",
    label: "Payload",
    default: "tinted",
    options: ["plain", "tinted", "night"],
    names: { plain: "Plain", tinted: "Tinted", night: "Night" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
});

const ok = (code: number) => code >= 200 && code < 300;

/**
 * Coldbrook's orders feed: three deliveries failed this afternoon. Replay
 * the 504 or the 410 and they go through; the 422 is refused again. The
 * Fieldline endpoint has never received anything — send it a test event.
 */
export function WebhookReplayDemo({
  chrome = true,
  // The log is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [list, setList] = React.useState<WebhookDelivery[]>(
    defaultWebhookDeliveries,
  );
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);

  // The endpoint answers after a short, fixed wait: a network that is slower
  // than the pulse, so the pulse is seen waiting at the chip.
  const answer = (d: WebhookDelivery) =>
    new Promise<WebhookReplayResult>((resolve) => {
      const res = d.replayAs ?? { status: 200, duration: 140 };
      window.setTimeout(() => {
        resolve(res);
        setNote(
          ok(res.status)
            ? `replayed ${d.event} · ${res.status} in ${res.duration} ms`
            : `still failing · ${res.status}`,
        );
      }, 760);
    });

  const log = (
    <WebhookReplay
      key={run}
      deliveries={list}
      onDeliveriesChange={setList}
      onReplay={answer}
      onPause={(e, paused) =>
        setNote(`${e.name.toLowerCase()} ${paused ? "paused" : "resumed"}`)
      }
      onRotateSecret={() => setNote("secret rotated")}
      onSendTest={() => setNote("test event sent")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{log}</div>;

  const orders = list.filter((d) => d.endpoint === "orders");
  const failed = orders.filter((d) => d.status !== 0 && !ok(d.status)).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {log}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setList(defaultWebhookDeliveries);
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
        <span className="text-signal">
          {note ?? `${orders.length} deliveries`}
        </span>{" "}
        · {failed} failed
      </p>
    </div>
  );
}
