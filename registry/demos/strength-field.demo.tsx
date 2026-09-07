"use client";

import * as React from "react";

import { StrengthField } from "@/registry/ui/strength-field";

export function StrengthFieldDemo() {
  const [password, setPassword] = React.useState("");
  const [grade, setGrade] = React.useState({ strength: 0, met: 0 });

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Fernworks account — every rule checks itself off as it is satisfied.
      </p>

      <StrengthField
        label="Choose a password"
        value={password}
        onValueChange={setPassword}
        onStrengthChange={(strength, met) => setGrade({ strength, met })}
        placeholder="At least eight characters"
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Strength{" "}
        <span className="text-signal tabular-nums">{grade.strength}</span> of 4
        · <span className="text-signal tabular-nums">{grade.met}</span> rules
        met
      </p>
    </div>
  );
}
