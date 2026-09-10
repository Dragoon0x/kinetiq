"use client";

import * as React from "react";

import { FormCard, type FormCardField } from "@/registry/ui/form-card";

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

const FIELDS: FormCardField[] = [
  { id: "name", label: "Name", placeholder: "Who is receiving it" },
  { id: "street", label: "Street", placeholder: "Street and number" },
  {
    id: "doorbell",
    label: "Doorbell note",
    placeholder: "Which bell to press",
    required: false,
    hint: "Optional, and read out by the driver.",
  },
  {
    id: "window",
    label: "Delivery window",
    kind: "select",
    options: ["Morning", "Afternoon", "Evening"],
    placeholder: "Pick a window",
  },
];

const FILLED: Record<string, string> = {
  name: "Marta Ferreira",
  street: "14 Basin Quay",
  doorbell: "Second bell, marked Fernworks",
  window: "Evening",
};

export function FormCardDemo() {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [submitted, setSubmitted] = React.useState(false);

  const answered = FIELDS.filter(
    (field) => (values[field.id] ?? "").trim() !== "",
  ).length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ol role="list" className="flex flex-col gap-2">
        <li className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-3">
            Coldbrook Supply · 11:02
          </span>
          <FormCard
            fields={FIELDS}
            values={values}
            onValuesChange={setValues}
            submitted={submitted}
            onSubmittedChange={setSubmitted}
            title="Delivery details"
            note="For the depot order placed this morning."
          />
        </li>
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setValues(FILLED)}
          disabled={submitted || answered === FIELDS.length}
          className={chip}
        >
          Fill it in
        </button>
        <button
          type="button"
          onClick={() => {
            setValues({});
            setSubmitted(false);
          }}
          disabled={!submitted && answered === 0}
          className={chip}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {submitted
          ? "Sent · "
          : `Open · ${answered} of ${FIELDS.length} answered · `}
        <span className="text-signal">
          {submitted ? (values.window ?? "no window") : "not sent"}
        </span>
      </p>
    </div>
  );
}
