"use client";

import * as React from "react";

import {
  SignaturePad,
  type SignatureStroke,
} from "@/registry/ui/signature-pad";

export function SignaturePadDemo() {
  const [strokes, setStrokes] = React.useState<SignatureStroke[]>([]);
  const [name, setName] = React.useState("");

  const signed = strokes.length > 0 || name.trim().length > 0;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Coldbrook delivery 4417 — sign for the drop, or type your name.
      </p>

      <SignaturePad
        label="Received by"
        onChange={setStrokes}
        onTypedChange={setName}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{strokes.length}</span>{" "}
        {strokes.length === 1 ? "stroke" : "strokes"} ·{" "}
        <span className={signed ? "text-signal" : undefined}>
          {signed ? "signature on file" : "unsigned"}
        </span>
      </p>
    </div>
  );
}
