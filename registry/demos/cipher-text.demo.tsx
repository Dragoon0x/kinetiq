"use client";

import * as React from "react";

import { CipherText } from "@/registry/ui/cipher-text";

export function CipherTextDemo() {
  const [run, setRun] = React.useState(0);

  return (
    <div className="flex w-[380px] max-w-full flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
          TYPE SPECIMEN
        </span>
        <button
          type="button"
          onClick={() => setRun((count) => count + 1)}
          className="border-input hover:bg-accent rounded-2 border px-2.5 py-1 text-xs font-medium"
        >
          Replay
        </button>
      </div>

      <CipherText
        key={run}
        as="h3"
        className="text-3xl font-semibold tracking-tight"
      >
        SPECIMEN KQ-029
      </CipherText>

      <div className="border-border flex flex-col gap-1.5 border-t pt-4">
        <CipherText
          trigger="hover"
          order="random"
          className="text-muted-foreground text-sm"
        >
          SN · 8842-AX-0093
        </CipherText>
        <p className="text-muted-foreground/70 font-mono text-[10px] tracking-[0.15em] uppercase">
          Hover to re-cipher
        </p>
      </div>
    </div>
  );
}
