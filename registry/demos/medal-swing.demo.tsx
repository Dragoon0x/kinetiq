"use client";

import { MedalSwing } from "@/registry/ui/medal-swing";

export function MedalSwingDemo() {
  return (
    <div className="flex w-full flex-wrap items-start justify-center gap-8">
      <MedalSwing tier="gold" />
      <MedalSwing tier="silver" label="runner up" />
      <MedalSwing tier="bronze" label="third" />
    </div>
  );
}
