"use client";

import * as React from "react";

import { Heading2, ImageIcon, ListChecks, Quote } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BranchOut, type BranchOutItem } from "@/registry/ui/branch-out";

export const tweaks = defineTweaks({
  spread: {
    kind: "range",
    label: "Spread",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  curve: {
    kind: "range",
    label: "Curve",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  stagger: {
    kind: "range",
    label: "Stagger",
    default: 60,
    min: 0,
    max: 120,
    step: 10,
    unit: "ms",
  },
});

const BLOCKS: BranchOutItem[] = [
  { id: "heading", label: "Heading", icon: <Heading2 className="size-full" /> },
  {
    id: "checklist",
    label: "Checklist",
    icon: <ListChecks className="size-full" />,
  },
  { id: "image", label: "Image", icon: <ImageIcon className="size-full" /> },
  { id: "quote", label: "Quote", icon: <Quote className="size-full" /> },
];

/**
 * A Fieldline page editor's insert button: the blocks you can add grow out
 * of it like branches.
 */
export function BranchOutDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [added, setAdded] = React.useState<string | null>(null);

  const menu = (
    <BranchOut
      label="Add a block"
      items={BLOCKS}
      open={open}
      onOpenChange={setOpen}
      onSelect={(id) => setAdded(id)}
      sound={sound}
      className="self-center"
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{menu}</div>;
  }

  const name = BLOCKS.find((b) => b.id === added)?.label.toLowerCase();
  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {menu}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {open ? "menu open" : added ? `added ${name}` : "menu closed"}
        </span>
        {open
          ? ` · ${BLOCKS.length} blocks`
          : added
            ? " · fieldline page"
            : " · press add a block"}
      </p>
    </div>
  );
}
