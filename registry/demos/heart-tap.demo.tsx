"use client";

import { MessageCircle, Repeat2 } from "lucide-react";

import { HeartTap } from "@/registry/ui/heart-tap";

export function HeartTapDemo() {
  return (
    <div className="border-border bg-card rounded-3 flex w-full max-w-sm flex-col gap-5 border px-5 py-6">
      <span className="text-label text-ink-3">HEART · TAP</span>

      {/* Framed like the action row under a social post. */}
      <div className="flex flex-col gap-4">
        <div className="border-hairline flex items-center gap-6 border-t pt-4">
          <HeartTap defaultCount={128} aria-label="Like" />
          <span className="text-ink-3 inline-flex items-center gap-2 text-sm tabular-nums">
            <MessageCircle aria-hidden className="size-[18px]" />
            24
          </span>
          <span className="text-ink-3 inline-flex items-center gap-2 text-sm tabular-nums">
            <Repeat2 aria-hidden className="size-[18px]" />
            9
          </span>
        </div>

        <div className="border-hairline flex items-center gap-6 border-t pt-4">
          <HeartTap defaultLiked defaultCount={40} aria-label="Like" />
          <span className="text-ink-3 inline-flex items-center gap-2 text-sm tabular-nums">
            <MessageCircle aria-hidden className="size-[18px]" />
            3
          </span>
          <span className="text-ink-3 inline-flex items-center gap-2 text-sm tabular-nums">
            <Repeat2 aria-hidden className="size-[18px]" />
            1
          </span>
        </div>
      </div>

      <p className="text-ink-3 font-mono text-[10px] tracking-[0.08em]">
        Tap to like — pop, sparks, and a rolling count.
      </p>
    </div>
  );
}
