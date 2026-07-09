"use client";

import * as React from "react";

import { Flame, Heart, PartyPopper, Sparkles, Star } from "lucide-react";

import { ReactionFly, type Reaction } from "@/registry/ui/reaction-fly";

const REACTIONS: Reaction[] = [
  { id: "like", label: "Like", node: <Heart /> },
  { id: "celebrate", label: "Celebrate", node: <PartyPopper /> },
  { id: "spark", label: "Spark", node: <Sparkles /> },
  { id: "fire", label: "Fire", node: <Flame /> },
  { id: "star", label: "Star", node: <Star /> },
];

/**
 * ReactionFly framed as the footer of a live post: a hairline plate with room
 * above the control so the floating reactions read their full rise, the control
 * sitting on a baseline rule, and a running tally of the last reaction. Press
 * the trigger to bloom the picker; choosing one flies a reaction up the stage.
 * The serial is stamped by the specimen plate around this demo.
 */
export function ReactionFlyDemo(): React.JSX.Element {
  const [last, setLast] = React.useState("—");

  const labelFor = (id: string) =>
    REACTIONS.find((reaction) => reaction.id === id)?.label ?? id;

  return (
    <div className="border-border bg-card rounded-3 flex w-full max-w-sm flex-col gap-5 border px-5 py-6">
      <span className="text-label text-ink-3">REACTION · FLY</span>

      {/* The stage: vertical room so the fly-up is visible above the control. */}
      <div className="relative flex min-h-40 flex-col justify-end">
        <div className="border-hairline flex items-center justify-between border-t pt-4">
          <ReactionFly
            reactions={REACTIONS}
            onReact={(id) => setLast(labelFor(id))}
            aria-label="React to this post"
          />
          <span className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">
            Last · <span className="text-ink-2">{last}</span>
          </span>
        </div>
      </div>

      <p className="text-ink-3 font-mono text-[10px] tracking-[0.08em]">
        Press to pick — reactions fly up.
      </p>
    </div>
  );
}
