"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSchemaFields,
  SchemaTable,
  type SchemaField,
} from "@/registry/ui/schema-table";

export const tweaks = defineTweaks({
  typeBadge: {
    kind: "choice",
    label: "Badge",
    default: "both",
    options: ["icon", "label", "both"],
    names: { icon: "Icon", label: "Label", both: "Both" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/**
 * The Fieldline equipment register halfway through a migration: Serviced
 * and Insured still hold text. Open Serviced and make it a date to watch the
 * column convert — one entry will not.
 */
export function SchemaTableDemo({
  chrome = true,
  // The editor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [fields, setFields] =
    React.useState<SchemaField[]>(defaultSchemaFields);
  const [event, setEvent] = React.useState<string | null>(null);

  const surface = (
    <SchemaTable
      key={round}
      onFieldsChange={(next) => {
        if (
          next.length === fields.length &&
          next.some((f, i) => f.id !== fields[i]?.id)
        ) {
          setEvent("fields reordered");
        }
        setFields(next);
      }}
      onFieldChange={(field, previous) =>
        setEvent(
          field.type !== previous.type
            ? `${field.name} → ${field.type}`
            : field.name !== previous.name
              ? `renamed ${field.name}`
              : `${field.name} options`,
        )
      }
      onAddField={() => setEvent("field added")}
      onRemoveField={(field) => setEvent(`${field.name} removed`)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setFields(defaultSchemaFields);
            setEvent(null);
            setRound((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {event ?? "open a field to retype it"}
        </span>{" "}
        · {fields.length} fields
      </p>
    </div>
  );
}
