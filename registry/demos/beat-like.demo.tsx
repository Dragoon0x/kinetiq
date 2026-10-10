"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  BeatLike,
  type BeatLikeHold,
  type BeatLikeKind,
} from "@/registry/ui/beat-like";

export const tweaks = defineTweaks({
  burst: {
    kind: "range",
    label: "Burst",
    default: 8,
    min: 4,
    max: 16,
    step: 1,
  },
  beat: {
    kind: "range",
    label: "Beat",
    default: 72,
    min: 48,
    max: 144,
    step: 8,
    unit: "bpm",
  },
  color: {
    kind: "choice",
    label: "Colour",
    default: "rose",
    options: ["rose", "amber", "cobalt", "mint"],
    names: { rose: "Rose", amber: "Amber", cobalt: "Cobalt", mint: "Mint" },
  },
});

/** Ferns under a lifting fog, drawn: the same picture on every load. */
function Thumbnail() {
  const fog = `beat-like-demo-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      aria-hidden
      viewBox="0 0 56 56"
      className="size-14 shrink-0 overflow-hidden rounded-2"
    >
      <defs>
        <linearGradient id={fog} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.86 0.03 170)" />
          <stop offset="0.55" stopColor="oklch(0.66 0.06 160)" />
          <stop offset="1" stopColor="oklch(0.42 0.07 155)" />
        </linearGradient>
      </defs>
      <rect width="56" height="56" fill={`url(#${fog})`} />
      <path
        d="M0 34C10 29 18 31 27 27C36 23 45 26 56 22V56H0Z"
        fill="oklch(0.55 0.06 158)"
        opacity="0.7"
      />
      <path
        d="M0 42C12 38 22 41 32 37C41 34 48 36 56 33V56H0Z"
        fill="oklch(0.44 0.07 155)"
      />
      <g stroke="oklch(0.32 0.06 152)" strokeWidth="1.1" fill="none">
        <path d="M14 56C14 47 16 41 21 35" />
        <path d="M16 50L11 47M16.6 46L12 42.6M18 42L14.4 38.4M19.4 38.6L16.8 35.6M15.6 50.6L20.2 47.8M16.6 46.2L21 43.6M18.2 42.2L22 40" />
        <path d="M40 56C40 49 38.6 44 35 39" />
        <path d="M39.6 51L44 48.4M39 46.8L43 44M37.8 43L41.4 40.6M39.4 51.4L35.4 48.6M38.6 47L35 44.4M37.4 43.2L34.4 41" />
      </g>
    </svg>
  );
}

const BASE = 1284;

/**
 * A Fernworks Journal post with its like button: tap to like, hold until the
 * ring around the heart closes for a super-like.
 */
export function BeatLikeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [liked, setLiked] = React.useState(false);
  const [kind, setKind] = React.useState<BeatLikeKind>("unlike");
  const [hold, setHold] = React.useState<BeatLikeHold>("idle");

  const post = (
    <div className="flex w-full max-w-sm items-center gap-3 self-center rounded-3 border border-hairline bg-card p-3">
      <Thumbnail />
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium text-foreground"
          title="Fog on the lower terraces"
        >
          Fog on the lower terraces
        </p>
        <p className="truncate text-xs text-ink-3">Ida Marsh · 4 min read</p>
      </div>
      <BeatLike
        label="Like this post"
        count={BASE}
        pressed={liked}
        onPressedChange={(next, how) => {
          setLiked(next);
          setKind(how);
        }}
        onHoldChange={setHold}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{post}</div>;
  }

  const total = String(BASE + (liked ? 1 : 0)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  const reading =
    hold === "full"
      ? "let go to super-like"
      : hold === "charging"
        ? "charging · hold until the ring closes"
        : liked
          ? `${kind === "super" ? "super-liked" : "liked"} · ${total}`
          : `not liked · ${total} · tap, or hold for a super-like`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {post}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {reading}
      </p>
    </div>
  );
}
