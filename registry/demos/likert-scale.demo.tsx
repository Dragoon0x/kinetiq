"use client";

import * as React from "react";

import { LikertScale } from "@/registry/ui/likert-scale";

export function LikertScaleDemo() {
  const [kit, setKit] = React.useState<number | undefined>(4);
  const [brief, setBrief] = React.useState<number | undefined>();

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <LikertScale
        question="The kit list matched what the site needed."
        value={kit}
        onValueChange={setKit}
      />

      <LikertScale
        question="The morning brief left no open questions."
        points={7}
        anchors={["Never", "Always"]}
        value={brief}
        onValueChange={setBrief}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Fieldline crew · kit {kit ?? "—"}/5 · brief {brief ?? "—"}/7
      </p>
    </div>
  );
}
