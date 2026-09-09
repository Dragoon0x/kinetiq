"use client";

import * as React from "react";

import { TemplateFill, composePrompt } from "@/registry/ui/template-fill";

const TEMPLATE =
  "Write a {tone: tone} release note for {audience: who reads it} about {feature: the feature}, in under {length: a number} words.";
const KEYS = ["tone", "audience", "feature", "length"];
const SAMPLE = {
  tone: "plain",
  audience: "field crews",
  feature: "the offline sync fix",
  length: "120",
};

const buttonClass =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function TemplateFillDemo() {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [last, setLast] = React.useState<string | null>(null);
  const [used, setUsed] = React.useState(false);

  const filled = KEYS.filter((key) => (values[key] ?? "").trim()).length;
  const chars = composePrompt(TEMPLATE, values).length;
  const complete = filled === KEYS.length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TemplateFill
        label="Release note"
        template={TEMPLATE}
        values={values}
        onValuesChange={(next) => {
          setValues(next);
          setUsed(false);
        }}
        onCommit={(key) => setLast(key)}
        onUse={() => setUsed(true)}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setValues(SAMPLE);
            setLast("length");
            setUsed(false);
          }}
        >
          Fill sample
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setValues({});
            setLast(null);
            setUsed(false);
          }}
        >
          Clear
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {used
          ? `Used · ${chars} chars`
          : complete
            ? `Ready · ${chars} chars`
            : `${filled} / ${KEYS.length} filled${last ? ` · last ${last}` : ""}`}
      </p>
    </div>
  );
}
