"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  MeldTags,
  type MeldTagsChange,
  type MeldTagsTag,
} from "@/registry/ui/meld-tags";

export const tweaks = defineTweaks({
  goo: {
    kind: "range",
    label: "Goo",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  radius: {
    kind: "range",
    label: "Meld radius",
    default: 24,
    min: 8,
    max: 48,
    step: 4,
    unit: "px",
  },
  tint: {
    kind: "choice",
    label: "Tint",
    default: "tint",
    options: ["mono", "tint"],
    names: { mono: "Mono", tint: "Tint" },
  },
  maxGroup: {
    kind: "range",
    label: "Max group",
    default: 4,
    min: 2,
    max: 6,
    step: 1,
  },
});

/** The Basinworks support view "Money trouble" and its filter tags. */
const TAGS: MeldTagsTag[] = [
  { id: "billing", label: "Billing" },
  { id: "refunds", label: "Refunds" },
  { id: "disputes", label: "Disputes" },
  { id: "urgent", label: "Urgent" },
  { id: "eu", label: "EU" },
  { id: "mobile", label: "Mobile" },
  { id: "enterprise", label: "Enterprise" },
];

const START: string[][] = [
  ["billing", "refunds"],
  ["disputes"],
  ["urgent"],
  ["eu"],
  ["mobile"],
  ["enterprise"],
];

const nameOf = (id: string) =>
  (TAGS.find((t) => t.id === id)?.label ?? id).toLowerCase();

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * A saved filter in Basinworks support: tags in one pill match any of them,
 * separate pills must all match. Drag a tag onto another to widen a rule;
 * pull one out of a pill to make it a rule of its own.
 */
export function MeldTagsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [groups, setGroups] = React.useState<string[][]>(START);
  const [last, setLast] = React.useState<MeldTagsChange | null>(null);
  const widest = groups.find((g) => g.length > 1);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="shrink-0 text-sm font-medium text-foreground">
          Money trouble
        </p>
        <p className="min-w-0 text-right text-xs text-balance text-ink-3">
          One pill matches any of its tags
        </p>
      </div>
      <MeldTags
        label="Money trouble filter"
        tags={TAGS}
        value={groups}
        onValueChange={(next, change) => {
          setGroups(next);
          setLast(change);
        }}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {last ? (
            <>
              <span className="text-signal">
                {last.kind === "meld"
                  ? `${nameOf(last.id)} joined ${nameOf(last.group[0] ?? "")}`
                  : `${nameOf(last.id)} pulled free`}
              </span>
              {` · ${plural(groups.length, "rule")}`}
            </>
          ) : (
            <>
              <span className="text-signal">
                {plural(groups.length, "rule")}
              </span>
              {widest ? ` · ${widest.map(nameOf).join(" or ")}` : ""}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
