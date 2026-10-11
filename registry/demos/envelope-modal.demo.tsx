"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultEnvelopeModalItems,
  EnvelopeModal,
} from "@/registry/ui/envelope-modal";

export const tweaks = defineTweaks({
  paperTone: {
    kind: "choice",
    label: "Paper",
    default: "ivory",
    options: ["ivory", "kraft", "linen", "blush"],
    names: { ivory: "Ivory", kraft: "Kraft", linen: "Linen", blush: "Blush" },
  },
  foldCount: {
    kind: "range",
    label: "Folds",
    default: 3,
    min: 2,
    max: 5,
    step: 1,
  },
  seal: {
    kind: "choice",
    label: "Seal",
    default: "wax",
    options: ["wax", "foil", "string", "none"],
    names: { wax: "Wax", foil: "Foil", string: "String", none: "None" },
  },
});

/**
 * The Fieldline Journal's letters from the field: six envelopes on the desk,
 * each opening into a story.
 */
export function EnvelopeModalDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const items = defaultEnvelopeModalItems;
  const letter = items.find((it) => it.id === open);

  const desk = (
    <EnvelopeModal
      items={items}
      value={open}
      onValueChange={setOpen}
      label="Letters from the field"
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div
        className="w-full overflow-clip rounded-3 border border-hairline bg-surface-2"
        style={{ height: 540 }}
      >
        {desk}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Journal · October
        </p>
        <p className="text-sm font-medium text-foreground">
          Letters from the field
        </p>
      </div>
      <div
        className="w-full overflow-clip rounded-3 border border-hairline bg-surface-2"
        style={{ height: 440 }}
      >
        {desk}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {letter ? (
          <>
            <span className="text-signal">reading</span> · {letter.title}
          </>
        ) : (
          <>
            <span className="text-signal">desk</span> · {items.length} letters,
            enter opens
          </>
        )}
      </p>
    </div>
  );
}
