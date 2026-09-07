"use client";

import * as React from "react";

import { FoldText } from "@/registry/ui/fold-text";

export function FoldTextDemo() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold">Fernworks Ridge Tarp</h3>
        <FoldText
          lines={3}
          open={open}
          onOpenChange={setOpen}
          moreLabel="Read more"
          lessLabel="Show less"
        >
          A two-pole tarp cut for exposed ground, in a 20-denier silicone nylon
          that holds its tension through a wet night. The ridge seam is taped
          rather than sewn twice, so it sheds instead of wicking, and the eight
          perimeter points are bar-tacked onto a webbing loop you can reach with
          gloves on. Pitched low it clears 900mm at the head; pitched high it
          becomes a kitchen for four. Packed with its guys and pegs it weighs
          640g and rolls to the size of a water bottle.
        </FoldText>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Description{" "}
        <span className="text-signal">{open ? "open" : "folded"}</span>
      </p>
    </div>
  );
}
