"use client";

import { VignetteCopresence } from "@/registry/ui/vignette-copresence";

export function VignetteCopresenceDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <VignetteCopresence scene="canvas" />
      <VignetteCopresence
        scene="board"
        remark="Walking it over once the linesmen ack."
      />
    </div>
  );
}
