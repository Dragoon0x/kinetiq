"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultFilterFields,
  defaultFilterNow,
  defaultFilterQuery,
  defaultFilterRows,
  FilterBuilder,
  matchFilter,
  type FilterGroup,
  type FilterNode,
  type FilterRule,
} from "@/registry/ui/filter-builder";

export const tweaks = defineTweaks({
  nesting: {
    kind: "range",
    label: "Nesting",
    default: 2,
    min: 0,
    max: 3,
    step: 1,
    unit: "levels",
  },
  chips: { kind: "toggle", label: "Chips", default: true },
  count: {
    kind: "choice",
    label: "Count",
    default: "rows",
    options: ["rows", "share", "off"],
    names: { rows: "Rows", share: "Share", off: "Off" },
  },
});

const rule = (
  id: string,
  field: string,
  operator: FilterRule["operator"],
  value: string,
): FilterRule => ({ id, kind: "rule", field, operator, value });

/**
 * The same search at each depth the builder allows: flat, one group, the
 * default two levels, and a third level that asks for flagged spend too.
 */
const QUERIES: FilterGroup[] = [
  {
    id: "root",
    kind: "group",
    combinator: "and",
    children: [
      rule("r1", "status", "is", "settled"),
      rule("r2", "amount", "gt", "250"),
      rule("r3", "category", "is", "travel"),
    ],
  },
  {
    id: "root",
    kind: "group",
    combinator: "and",
    children: [
      rule("r1", "status", "is", "settled"),
      rule("r2", "amount", "gt", "250"),
      {
        id: "g1",
        kind: "group",
        combinator: "or",
        children: [
          rule("r3", "category", "is", "travel"),
          rule("r5", "card", "is", "virtual"),
        ],
      },
    ],
  },
  defaultFilterQuery,
  {
    id: "root",
    kind: "group",
    combinator: "and",
    children: [
      rule("r1", "status", "is", "settled"),
      rule("r2", "amount", "gt", "250"),
      {
        id: "g1",
        kind: "group",
        combinator: "or",
        children: [
          rule("r3", "category", "is", "travel"),
          {
            id: "g2",
            kind: "group",
            combinator: "and",
            children: [
              rule("r4", "region", "is", "fernland"),
              {
                id: "g3",
                kind: "group",
                combinator: "or",
                children: [
                  rule("r5", "card", "is", "virtual"),
                  rule("r6", "flagged", "is", "true"),
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

const grouped = new Intl.NumberFormat("en-US");

const tally = (node: FilterNode): { rules: number; groups: number } => {
  if (node.kind === "rule") return { rules: 1, groups: 0 };
  let rules = 0;
  let groups = 0;
  for (const c of node.children) {
    const t = tally(c);
    rules += t.rules;
    groups += t.groups + (c.kind === "group" ? 1 : 0);
  }
  return { rules, groups };
};

/**
 * Coldbrook Bank's transaction search: settled card payments over $250 that
 * were travel, or virtual-card spend in Fernland.
 */
export function FilterBuilderDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const depth = values.nesting ?? 2;
  const seedOf = (d: number) =>
    QUERIES[Math.min(3, Math.max(0, Math.round(d)))] ?? defaultFilterQuery;
  // The nesting tweak sets where the query starts; the visitor edits it.
  const [query, setQuery] = React.useState(() => seedOf(depth));
  const [seenDepth, setSeenDepth] = React.useState(depth);
  const [applied, setApplied] = React.useState<number | null>(null);
  if (seenDepth !== depth) {
    setSeenDepth(depth);
    setQuery(seedOf(depth));
    setApplied(null);
  }

  const builder = (
    <FilterBuilder
      title="Transactions"
      noun={{ one: "transaction", other: "transactions" }}
      applyLabel="Show"
      value={query}
      onValueChange={(q) => {
        setQuery(q);
        setApplied(null);
      }}
      onApply={(q) =>
        setApplied(
          defaultFilterRows.filter((r) =>
            matchFilter(q, r, defaultFilterFields, defaultFilterNow),
          ).length,
        )
      }
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{builder}</div>;

  const matched = defaultFilterRows.filter((r) =>
    matchFilter(query, r, defaultFilterFields, defaultFilterNow),
  ).length;
  const { rules, groups } = tally(query);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {builder}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {applied !== null ? (
          <>
            <span className="text-signal">applied</span> ·{" "}
            {grouped.format(applied)} transactions
          </>
        ) : (
          <>
            <span className="text-signal">
              {grouped.format(matched)} of{" "}
              {grouped.format(defaultFilterRows.length)} transactions
            </span>{" "}
            · {rules} {rules === 1 ? "rule" : "rules"} · {groups}{" "}
            {groups === 1 ? "group" : "groups"}
          </>
        )}
      </p>
    </div>
  );
}
