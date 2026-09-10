"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FormCardField = {
  id: string;
  /** The question, as a short label. */
  label: string;
  /** A text field or a native select. @default "text" */
  kind?: "text" | "select";
  /** The select's choices, in order. Ignored by a text field. */
  options?: string[];
  placeholder?: string;
  /** An empty required field refuses the send and takes a message. @default true */
  required?: boolean;
  /** One quieter line under the control. */
  hint?: string;
};

export type FormCardProps = {
  ref?: React.Ref<HTMLFormElement>;
  /** The questions, in order. */
  fields: FormCardField[];
  /** Controlled answers, keyed by field id. */
  values?: Record<string, string>;
  /** Initial answers for uncontrolled use. @default {} */
  defaultValues?: Record<string, string>;
  /** Fires from the change handler with the next whole record. */
  onValuesChange?: (values: Record<string, string>) => void;
  /** Controlled face: true shows the summary. */
  submitted?: boolean;
  /** Initial face for uncontrolled use. @default false */
  defaultSubmitted?: boolean;
  /** Fires from Send and from Edit, in that direction. */
  onSubmittedChange?: (submitted: boolean) => void;
  /** Fires once from Send with the frozen answers. */
  onSubmit?: (values: Record<string, string>) => void;
  /** The card's heading. @default "Delivery details" */
  title?: string;
  /** One quieter line under the heading. */
  note?: string;
  /** @default "Send details" */
  submitLabel?: string;
  /** @default "Edit" */
  editLabel?: string;
  /** The chip's word once the card is sent. @default "Sent" */
  sentLabel?: string;
  /** Holds every control. @default false */
  disabled?: boolean;
  className?: string;
};

const control =
  "h-9 w-full rounded-2 border border-input bg-surface-0 px-2.5 text-sm outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/**
 * A form that lives in the thread and keeps its answer. Open, it is a real
 * `<form>` of real fields; sent, the answers stamp into a summary in the same
 * box. Because the two faces are different heights the box measures the live
 * one with a ResizeObserver and glides to it on `glide` rather than reserving
 * room for the taller of them — a zero measurement taken during the swap is
 * ignored, so the box holds its height across the crossfade instead of
 * collapsing for a frame.
 *
 * Each summary row arrives from 8px on `snap` in a `cascade`, so the values
 * slide into the record one after another, and the Sent chip lands on `recoil`
 * — two visible bounces, which a confirmation has earned. Editing runs the
 * same beat backwards and puts focus back in the first field once the swap has
 * finished, never into an element that has not mounted yet.
 *
 * A field left empty is not a celebration: the send is refused, the empty
 * fields take `aria-invalid` with a named message, nothing bounces, and focus
 * moves to the first that still needs an answer. Under reduced motion the
 * faces cross-fade and the rows arrive together — the record still shows,
 * because the record is the information.
 */
export function FormCard({
  ref,
  fields,
  values,
  defaultValues,
  onValuesChange,
  submitted,
  defaultSubmitted = false,
  onSubmittedChange,
  onSubmit,
  title = "Delivery details",
  note,
  submitLabel = "Send details",
  editLabel = "Edit",
  sentLabel = "Sent",
  disabled = false,
  className,
}: FormCardProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const headId = `${baseId}-head`;

  const [uncontrolledValues, setUncontrolledValues] = React.useState<
    Record<string, string>
  >(defaultValues ?? {});
  const valuesControlled = values !== undefined;
  const answers = valuesControlled ? values : uncontrolledValues;

  const [uncontrolledSent, setUncontrolledSent] =
    React.useState(defaultSubmitted);
  const sentControlled = submitted !== undefined;
  const sent = sentControlled ? submitted : uncontrolledSent;

  const [missing, setMissing] = React.useState<string[]>([]);
  const [attempt, setAttempt] = React.useState(0);

  // A field is only missing while it is still empty. Reading it this way means
  // an answer arriving from a controlled parent clears the error too — the
  // list alone would keep a filled field marked invalid for ever.
  const isMissing = (id: string) =>
    missing.includes(id) && (answers[id] ?? "").trim() === "";

  const answerOf = (id: string) => (answers[id] ?? "").trim();
  const answered = fields.filter((field) => answerOf(field.id) !== "").length;

  const setValue = (id: string, next: string) => {
    const merged = { ...answers, [id]: next };
    if (!valuesControlled) setUncontrolledValues(merged);
    onValuesChange?.(merged);
    if (missing.includes(id) && next.trim() !== "") {
      setMissing(missing.filter((entry) => entry !== id));
    }
  };

  const setSent = (next: boolean) => {
    if (!sentControlled) setUncontrolledSent(next);
    onSubmittedChange?.(next);
  };

  const send = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || sent) return;
    const empty = fields
      .filter((field) => field.required !== false && answerOf(field.id) === "")
      .map((field) => field.id);
    setMissing(empty);
    setAttempt((count) => count + 1);
    if (empty[0] !== undefined) {
      document.getElementById(`${baseId}-f-${empty[0]}`)?.focus();
      return;
    }
    setSent(true);
    onSubmit?.({ ...answers });
  };

  // The summary leaves before the open face mounts, so a focus fired on a
  // guessed frame lands on an element that does not exist yet and the keyboard
  // is dropped on the body. The wish is answered by the field itself, when its
  // node arrives.
  const pendingFocus = React.useRef(false);
  const [firstField, setFirstField] = React.useState<
    HTMLInputElement | HTMLSelectElement | null
  >(null);

  const edit = () => {
    if (disabled) return;
    pendingFocus.current = true;
    setSent(false);
  };

  React.useEffect(() => {
    if (!firstField || !pendingFocus.current) return;
    pendingFocus.current = false;
    firstField.focus();
  }, [firstField]);

  // The box measures whichever face is live. A zero reading belongs to the
  // frame where one face has left and the next has not arrived; taking it
  // would slam the card shut and open it again.
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      if (next === 0) return;
      setHeight((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Frozen at the moment of the change and built in one string, so nothing is
  // spoken half a state behind and no comma arrives with a space before it.
  const spokenKey = `${sent ? "sent" : "open"}:${attempt}`;
  const [spoken, setSpoken] = React.useState(() => ({
    key: spokenKey,
    text: "",
  }));
  if (spoken.key !== spokenKey) {
    const wasSent = spoken.key.startsWith("sent");
    const short = missing.length;
    setSpoken({
      key: spokenKey,
      text: sent
        ? `Details sent. ${answered} ${answered === 1 ? "answer is" : "answers are"} in the thread.`
        : short > 0
          ? `${short === 1 ? "One field" : `${short} fields`} still ${short === 1 ? "needs" : "need"} an answer.`
          : wasSent
            ? "Editing your answers."
            : "",
    });
  }

  const stagger = cascade(fields.length);

  return (
    <form
      ref={ref}
      noValidate
      onSubmit={send}
      aria-labelledby={headId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <h3 id={headId} className="truncate text-sm font-semibold">
            {title}
          </h3>
          {note ? (
            <span className="text-[11px] leading-snug text-ink-3">{note}</span>
          ) : null}
        </span>
        <AnimatePresence initial={false}>
          {sent ? (
            <motion.span
              key="sent"
              initial={motionSafe ? { scale: 0.8, opacity: 0 } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={motionSafe ? springs.recoil : FADE}
              style={{ originX: 0.5, originY: 0.5 }}
              className="shrink-0 rounded-full border border-success/50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-success uppercase"
            >
              {sentLabel}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Widened by a hair so a focus ring inside is not clipped by the
          overflow the height animation needs. */}
      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={motionSafe ? springs.glide : FADE}
        className="-mx-1 overflow-hidden"
      >
        <div ref={innerRef} className="px-1">
          <AnimatePresence mode="wait" initial={false}>
            {sent ? (
              <motion.div
                key="summary"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={FADE}
                className="flex flex-col gap-2"
              >
                <dl className="flex flex-col gap-1.5">
                  {fields.map((field, index) => (
                    <motion.div
                      key={field.id}
                      initial={
                        motionSafe
                          ? { opacity: 0, y: distances.step }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        motionSafe
                          ? { ...springs.snap, delay: index * stagger }
                          : FADE
                      }
                      className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1.5 last:border-b-0 last:pb-0"
                    >
                      <dt className="shrink-0 text-[11px] text-ink-3">
                        {field.label}
                      </dt>
                      <dd
                        className="min-w-0 truncate text-xs font-medium"
                        title={answerOf(field.id)}
                      >
                        {answerOf(field.id) === "" ? "—" : answerOf(field.id)}
                      </dd>
                    </motion.div>
                  ))}
                </dl>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={edit}
                    disabled={disabled}
                    className={chip}
                  >
                    {editLabel}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="fields"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={FADE}
                className="flex flex-col gap-2.5"
              >
                {fields.map((field, index) => {
                  const fieldId = `${baseId}-f-${field.id}`;
                  const noteId = `${baseId}-n-${field.id}`;
                  const invalid = isMissing(field.id);
                  const aside = invalid
                    ? `${field.label} still needs an answer.`
                    : field.hint;
                  const shared = {
                    id: fieldId,
                    ref: index === 0 ? setFirstField : undefined,
                    disabled,
                    value: answers[field.id] ?? "",
                    "aria-invalid": invalid || undefined,
                    "aria-describedby": aside ? noteId : undefined,
                    onChange: (
                      event: React.ChangeEvent<
                        HTMLInputElement | HTMLSelectElement
                      >,
                    ) => setValue(field.id, event.target.value),
                    className: cn(control, invalid && "border-danger"),
                  };

                  return (
                    <div key={field.id} className="flex flex-col gap-1">
                      <label
                        htmlFor={fieldId}
                        className="text-[11px] font-medium text-ink-2"
                      >
                        {field.label}
                      </label>
                      {field.kind === "select" ? (
                        <select {...shared}>
                          <option value="">
                            {field.placeholder ?? "Choose one"}
                          </option>
                          {(field.options ?? []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          {...shared}
                          type="text"
                          placeholder={field.placeholder}
                        />
                      )}
                      {aside ? (
                        <span
                          id={noteId}
                          className={cn(
                            "text-[11px] leading-snug",
                            invalid ? "text-danger" : "text-ink-3",
                          )}
                        >
                          {aside}
                        </span>
                      ) : null}
                    </div>
                  );
                })}

                <div className="flex items-center justify-between gap-2">
                  <span
                    aria-hidden
                    className="font-mono text-[10px] text-ink-3 tabular-nums"
                  >
                    {`${answered}/${fields.length}`}
                  </span>
                  <button type="submit" disabled={disabled} className={chip}>
                    {submitLabel}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.text}
      </span>
    </form>
  );
}
