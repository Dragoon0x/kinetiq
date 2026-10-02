"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultListDetailItems,
  ListDetail,
  type ListDetailLayout,
} from "@/registry/ui/list-detail";

export const tweaks = defineTweaks({
  morph: {
    kind: "choice",
    label: "Morph",
    default: "arc",
    options: ["glide", "arc", "fade"],
    names: { glide: "Glide", arc: "Arc", fade: "Fade" },
  },
  stream: {
    kind: "range",
    label: "Stream",
    default: 50,
    min: 0,
    max: 100,
    step: 10,
    unit: "ms",
  },
  split: {
    kind: "choice",
    label: "Split",
    default: "auto",
    options: ["auto", "stack", "rail"],
    names: { auto: "Auto", stack: "Stacked", rail: "Rail" },
  },
});

/**
 * The Fernworks team directory: choose someone and their row becomes their
 * page; message or schedule from it.
 */
export function ListDetailDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [id, setId] = React.useState<string | null>(null);
  const [layout, setLayout] = React.useState<ListDetailLayout | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const person = defaultListDetailItems.find((p) => p.id === id);
  const arrangement =
    values.split === "rail"
      ? "rail"
      : layout === "split"
        ? "side by side"
        : "stacked";

  return (
    <div className="flex w-full max-w-5xl flex-col gap-3">
      <ListDetail
        label="People"
        value={id}
        onValueChange={(next) => {
          setId(next);
          setDone(null);
        }}
        onLayoutChange={setLayout}
        onAction={(action, itemId) => {
          const who = defaultListDetailItems.find((p) => p.id === itemId);
          if (!who) return;
          setDone(
            action === "message"
              ? `messaged ${who.title}`
              : `invite sent to ${who.title}`,
          );
        }}
        height={chrome ? 480 : 540}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {done ? (
            <>
              <span className="text-signal">{done}</span> · {arrangement}
            </>
          ) : person ? (
            <>
              <span className="text-signal">{person.title}</span> ·{" "}
              {person.subtitle} · {arrangement}
            </>
          ) : (
            <>
              <span className="text-signal">
                {defaultListDetailItems.length} people
              </span>{" "}
              · {arrangement} · choose someone
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
