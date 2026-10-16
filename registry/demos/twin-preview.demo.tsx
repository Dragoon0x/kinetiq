"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultTwinPreviewListing,
  TwinPreview,
  type TwinPreviewFieldId,
  type TwinPreviewListing,
  type TwinPreviewPhoto,
} from "@/registry/ui/twin-preview";

export const tweaks = defineTweaks({
  cardStyle: {
    kind: "choice",
    label: "Card",
    default: "tile",
    options: ["tile", "row", "poster"],
    names: { tile: "Tile", row: "Row", poster: "Poster" },
  },
  layout: {
    kind: "choice",
    label: "Layout",
    default: "split",
    options: ["split", "mirror", "peek"],
    names: { split: "Split", mirror: "Mirror", peek: "Peek" },
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

const FIELDS: TwinPreviewFieldId[] = [
  "photos",
  "title",
  "price",
  "size",
  "tags",
  "description",
];

const WORD: Record<TwinPreviewFieldId, string> = {
  photos: "photos",
  title: "title",
  price: "price",
  size: "pot size",
  tags: "tags",
  description: "description",
};

const filled = (l: TwinPreviewListing) =>
  [
    l.photos.length > 0,
    l.title.trim() !== "",
    l.price !== null,
    l.size !== "",
    l.tags.length > 0,
    l.description.trim() !== "",
  ].filter(Boolean).length;

/** A tiny seeded generator, so every run of the demo uploads the same way. */
const steps = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/**
 * Fernworks listing a variegated string of pearls. Photos upload with seeded
 * progress (the second one drops halfway and goes through on Retry); Save
 * draft and Publish answer after a short wait.
 */
export function TwinPreviewDemo({
  chrome = true,
  // The editor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [listing, setListing] = React.useState(defaultTwinPreviewListing);
  const [field, setField] = React.useState<TwinPreviewFieldId | null>(null);
  const [event, setEvent] = React.useState<string | null>(null);
  const [upload, setUpload] = React.useState<{ n: number; p: number } | null>(
    null,
  );
  const timers = React.useRef(new Set<number>());
  const made = React.useRef(0);
  const latest = React.useRef(listing);
  React.useEffect(() => {
    latest.current = listing;
  });

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    made.current = 0;
    setListing(defaultTwinPreviewListing);
    setField(null);
    setEvent(null);
    setUpload(null);
    setRound((r) => r + 1);
  };

  const onUpload = (
    photo: TwinPreviewPhoto,
    report: (progress: number) => void,
  ) =>
    new Promise<void>((resolve, reject) => {
      made.current += 1;
      const attempt = made.current;
      const drops = attempt === 2;
      const next = steps(attempt * 97 + photo.seed);
      // The editor uploads as it adds, before this demo has seen the new
      // listing: a photo it does not know yet is the next one.
      const at = latest.current.photos.findIndex((x) => x.id === photo.id);
      const n = at === -1 ? latest.current.photos.length + 1 : at + 1;
      let p = 0;
      const tick = () => {
        p = Math.min(1, p + 0.07 + next() * 0.11);
        report(p);
        setUpload({ n, p });
        if (drops && p > 0.5) {
          setUpload(null);
          setEvent(`photo ${n} dropped · retry it`);
          reject(new Error("dropped"));
          return;
        }
        if (p >= 1) {
          setUpload(null);
          setEvent(`photo ${n} uploaded`);
          resolve();
          return;
        }
        later(tick, 150 + Math.round(next() * 120));
      };
      later(tick, 220);
    });

  const surface = (
    <TwinPreview
      key={round}
      value={listing}
      onChange={(next) => {
        setListing(next);
        setEvent(null);
      }}
      onActiveFieldChange={setField}
      onUpload={onUpload}
      onSaveDraft={() =>
        new Promise<void>((resolve) =>
          later(() => {
            setEvent("draft saved");
            resolve();
          }, 650),
        )
      }
      onPublish={(l) =>
        new Promise<void>((resolve) =>
          later(() => {
            setEvent(
              `published · ${l.title.toLowerCase()}${l.price !== null ? ` · ${money.format(l.price)}` : ""}`,
            );
            resolve();
          }, 1100),
        )
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const count = `${filled(listing)} of ${FIELDS.length} fields filled`;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
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
        {upload ? (
          <>
            <span className="text-signal">uploading photo {upload.n}</span> ·{" "}
            {Math.round(upload.p * 100)}%
          </>
        ) : event ? (
          <>
            <span className="text-signal">{event}</span> · {count}
          </>
        ) : field ? (
          <>
            <span className="text-signal">editing {WORD[field]}</span> · {count}
          </>
        ) : (
          <>
            <span className="text-signal">draft</span> · {count}
          </>
        )}
      </p>
    </div>
  );
}
