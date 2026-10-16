"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { Check, Pencil, RotateCcw, TriangleAlert, Undo2 } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type AssumptionValue = string | number;
export type AssumptionValues = Record<string, AssumptionValue>;

export type AssumptionOption = { value: AssumptionValue; label: string };

export type Assumption = {
  /** Unique; sentences list the ids they depend on. */
  id: string;
  /** What is assumed: "Team size". */
  label: string;
  /** The value the answer was first written with. */
  value: AssumptionValue;
  /** Edit by choosing one of these (a radiogroup). */
  options?: AssumptionOption[];
  /** Edit as a number instead: limits and step. */
  min?: number;
  max?: number;
  step?: number;
  /** Printed after a number: "%". */
  unit?: string;
  /** Where the assumption came from, in a few words. */
  source?: string;
};

export type AnswerSentence = {
  /** Stable across rewrites: a sentence keeps its id when its words change. */
  id: string;
  text: string;
  /** The assumptions this sentence rests on. */
  deps: string[];
};

export type AnswerParagraph = { id: string; sentences: AnswerSentence[] };

export type AssumptionConflict = {
  /** The two assumptions that cannot both hold. */
  pins: [string, string];
  /** Why, in one sentence. */
  reason: string;
};

export type AssumptionPinStyle = "tack" | "tag" | "rule";
export type AssumptionHighlight = "wash" | "line" | "focus";
export type AssumptionPinsStatus = "ready" | "loading" | "error";

export type AssumptionPinsProps = {
  /** The question the answer replies to. @default the Fernworks budget question */
  question?: string;
  /** The assumptions, pinned in this order. @default defaultAssumptions */
  assumptions?: Assumption[];
  /** Controlled assumption values. */
  values?: AssumptionValues;
  /** Initial values when uncontrolled. @default each assumption's `value` */
  defaultValues?: AssumptionValues;
  /** Fires from the edit or revert that changed a value, with every value. */
  onValuesChange?: (values: AssumptionValues) => void;
  /** Writes the answer from the values. Sentences keep their ids, so only the ones whose words change are rewritten. @default composeFernworksAnswer */
  compose?: (values: AssumptionValues) => AnswerParagraph[];
  /** Finds assumptions that contradict each other. @default fernworksConflicts */
  conflicts?: (values: AssumptionValues) => AssumptionConflict[];
  /** An assumption was edited. Return a promise to hold the rewrite until the host has re-run the answer. */
  onEditAssumption?: (
    id: string,
    value: AssumptionValue,
    previous: AssumptionValue,
  ) => void | Promise<unknown>;
  /** Use this answer was pressed, with the answer as plain text. */
  onAcceptAnswer?: (text: string, values: AssumptionValues) => void;
  /** An assumption was reverted to the value the answer was first written with. */
  onRevert?: (id: string, value: AssumptionValue) => void;
  /** Whether the answer has arrived. @default "ready" */
  status?: AssumptionPinsStatus;
  /** Try again was pressed after the answer failed to load. */
  onReload?: () => void;
  /** The model answering, in the header. @default "Fernworks Model 3" */
  model?: string;
  /** How long the rewrite "thinks" before it streams, ms. @default 650 */
  rerunDelay?: number;
  /** Words a second as a rewritten sentence streams back in. @default 28 */
  streamSpeed?: number;
  /** How long a rewritten sentence keeps its underline, ms. @default 2600 */
  underlineHold?: number;
  /** A card with a round pin head, a notched tag, or a bare rule. @default "tack" */
  pinStyle?: AssumptionPinStyle;
  /** How a pin's sentences light: a wash, a thick underline, or full ink while the rest dims. @default "wash" */
  highlight?: AssumptionHighlight;
  /** Pin numbers, the lit wash, the rewrite underline, the comb and Use this answer: any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The surface's height in px; the answer scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be edited or accepted. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];
const word = (n: number) => WORDS[n] ?? String(n);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MONTHS_LEFT: Record<string, number> = {
  March: 10,
  April: 9,
  June: 7,
  September: 4,
};

export const defaultAssumptions: Assumption[] = [
  {
    id: "size",
    label: "Team size",
    value: 4,
    options: [3, 4, 5, 6].map((n) => ({ value: n, label: `${n} engineers` })),
    source: "Platform roadmap",
  },
  {
    id: "start",
    label: "Start month",
    value: "April",
    options: ["March", "April", "June", "September"].map((m) => ({
      value: m,
      label: m,
    })),
    source: "Hiring plan",
  },
  {
    id: "salary",
    label: "Average salary",
    value: 82,
    options: [74, 82, 90].map((n) => ({ value: n, label: `€${n}k` })),
    source: "Lisbon pay bands",
  },
  {
    id: "oncost",
    label: "Employer costs",
    value: 24,
    min: 0,
    max: 40,
    step: 1,
    unit: "%",
    source: "Payroll provider",
  },
  {
    id: "cap",
    label: "Budget cap",
    value: 400,
    options: [350, 400, 450, 500].map((n) => ({ value: n, label: `€${n}k` })),
    source: "Board approval",
  },
];

const num = (v: AssumptionValue | undefined, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const fernworksTotals = (v: AssumptionValues) => {
  const size = num(v.size, 4);
  const salary = num(v.salary, 82);
  const oncost = num(v.oncost, 24);
  const cap = num(v.cap, 400);
  const start = String(v.start ?? "April");
  const months = MONTHS_LEFT[start] ?? 9;
  const perHead = Math.round(salary * (1 + oncost / 100));
  const payroll = Math.round(
    (size * salary * (1 + oncost / 100) * months) / 12,
  );
  const fees = Math.round(size * salary * 0.15);
  const total = payroll + fees;
  return {
    size,
    salary,
    oncost,
    cap,
    start,
    months,
    perHead,
    payroll,
    fees,
    total,
  };
};

/** The Fernworks answer, written from its assumptions. */
export function composeFernworksAnswer(
  values: AssumptionValues,
): AnswerParagraph[] {
  const t = fernworksTotals(values);
  const launch =
    t.start === "March" || t.start === "April"
      ? `Starting in ${t.start} keeps the platform launch on track for the autumn.`
      : t.start === "June"
        ? "Starting in June pushes the platform launch into the winter."
        : `Starting in ${t.start} pushes the platform launch into next year.`;
  return [
    {
      id: "p1",
      sentences: [
        {
          id: "s1",
          deps: ["size", "start"],
          text: `${capital(word(t.size))} engineers starting in ${t.start} are on payroll for ${word(t.months)} months of this year.`,
        },
        {
          id: "s2",
          deps: ["salary", "oncost"],
          text: `Each costs €${t.perHead}k a year with employer costs, on an average salary of €${t.salary}k plus ${t.oncost}%.`,
        },
        {
          id: "s3",
          deps: ["size", "start", "salary", "oncost"],
          text: `That puts this year's payroll at €${t.payroll}k.`,
        },
      ],
    },
    {
      id: "p2",
      sentences: [
        {
          id: "s4",
          deps: ["size", "salary"],
          text: `Recruiting fees add a one-off €${t.fees}k, at 15% of first-year salary per hire.`,
        },
        {
          id: "s5",
          deps: ["size", "start", "salary", "oncost", "cap"],
          text:
            t.total <= t.cap
              ? `Together that's €${t.total}k, €${t.cap - t.total}k inside the €${t.cap}k cap.`
              : `Together that's €${t.total}k, €${t.total - t.cap}k over the €${t.cap}k cap.`,
        },
        {
          id: "s6",
          deps: [],
          text: "Equipment sits in its own budget, so laptops and licences aren't counted here.",
        },
      ],
    },
    {
      id: "p3",
      sentences: [
        { id: "s7", deps: ["start"], text: launch },
        {
          id: "s8",
          deps: [],
          text: "Two things to check before you commit: whether the cap includes recruiting fees, and whether any hire is a contractor, who carries no employer costs.",
        },
      ],
    },
  ];
}

/** Team size and the budget cap contradict once the total runs over. */
export function fernworksConflicts(
  values: AssumptionValues,
): AssumptionConflict[] {
  const t = fernworksTotals(values);
  if (t.total <= t.cap) return [];
  return [
    {
      pins: ["size", "cap"],
      reason: `${capital(word(t.size))} engineers at €${t.salary}k come to €${t.total}k, €${t.total - t.cap}k over the €${t.cap}k cap.`,
    },
  ];
}

const DEFAULT_QUESTION =
  "What will the new platform team cost Fernworks this year?";

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const r1 = (v: number) => Math.round(v * 10) / 10;

const display = (a: Assumption, v: AssumptionValue | undefined) => {
  const value = v ?? a.value;
  const option = a.options?.find((o) => o.value === value);
  if (option) return option.label;
  return `${value}${a.unit ?? ""}`;
};

const signature = (paras: AnswerParagraph[]) =>
  paras
    .map((p) => p.sentences.map((s) => `${s.id}:${s.text}`).join("|"))
    .join("¶");

const plainText = (paras: AnswerParagraph[]) =>
  paras.map((p) => p.sentences.map((s) => s.text).join(" ")).join("\n\n");

const textById = (paras: AnswerParagraph[]) => {
  const map = new Map<string, string>();
  for (const p of paras) for (const s of p.sentences) map.set(s.id, s.text);
  return map;
};

const splitWords = (text: string) => text.split(/\s+/).filter(Boolean);

type Phase = "dissolve" | "wait" | "stream" | "done";
type Run = {
  phase: Phase;
  /** Sentence ids being rewritten, in reading order. */
  changed: string[];
  /** Their words before the rewrite. */
  old: Record<string, string>;
  /** Words of the new text revealed so far, across all changed sentences. */
  words: number;
};

/* ----------------------------------------------------------------------- */
/*                                Paragraph                                 */
/* ----------------------------------------------------------------------- */

/** A paragraph whose height glides when a rewrite changes its line count. */
function Paragraph({
  children,
  motionSafe,
  className,
}: {
  children: React.ReactNode;
  motionSafe: boolean;
  className?: string;
}) {
  const [node, setNode] = React.useState<HTMLParagraphElement | null>(null);
  const [h, setH] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setH(Math.round(node.offsetHeight)));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      initial={false}
      animate={{ height: h ?? "auto" }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      className="overflow-hidden"
    >
      <p ref={setNode} className={className}>
        {children}
      </p>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * An answer that shows its working. The assumptions it rests on are pinned
 * beside it; every sentence names the assumptions it depends on, so pointing
 * at or focusing a pin lights just those sentences and draws a comb across
 * the gutter to them on `springs.glide`.
 *
 * Edit a pin and the answer is re-run, but only the sentences whose words
 * actually change are touched: they dissolve in place on the exit ease, a
 * cascade apart, hold a faint shimmer while the rewrite thinks, then stream
 * back word by word while every other sentence holds perfectly still. Each
 * rewritten sentence keeps an underline that sweeps in on glide and fades,
 * and a paragraph whose line count changed glides to its new height. When two
 * pins contradict, both are flagged, bracketed together and Use this answer
 * waits with the reason.
 *
 * Pins are a list with a roving tabindex: arrows move, Enter edits inline,
 * Escape cancels an edit or reverts a changed pin. Under 40rem the pins
 * become a strip of chips above the answer and edit in place. Under reduced
 * motion the rewrite is a cross-fade and the underline simply appears.
 */
export function AssumptionPins({
  question = DEFAULT_QUESTION,
  assumptions = defaultAssumptions,
  values,
  defaultValues,
  onValuesChange,
  compose = composeFernworksAnswer,
  conflicts = fernworksConflicts,
  onEditAssumption,
  onAcceptAnswer,
  onRevert,
  status = "ready",
  onReload,
  model = "Fernworks Model 3",
  rerunDelay = 650,
  streamSpeed = 28,
  underlineHold = 2600,
  pinStyle = "tack",
  highlight = "wash",
  accent = "var(--accent-bright)",
  height = 540,
  disabled = false,
  className,
}: AssumptionPinsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  /* ----------------------------- values ----------------------------- */

  const originals = React.useMemo(() => {
    const out: AssumptionValues = {};
    for (const a of assumptions) out[a.id] = a.value;
    return out;
  }, [assumptions]);
  const [ownValues, setOwnValues] = React.useState<AssumptionValues>(() => ({
    ...originals,
    ...defaultValues,
  }));
  const current = React.useMemo(
    () => ({ ...originals, ...(values ?? ownValues) }),
    [originals, values, ownValues],
  );

  const target = React.useMemo(() => compose(current), [compose, current]);
  const targetSig = signature(target);
  const found = conflicts(current);
  const conflicted = new Set(found.flatMap((c) => c.pins));

  /* ----------------------------- rewrite ---------------------------- */

  const [shown, setShown] = React.useState<AnswerParagraph[]>(target);
  const [run, setRun] = React.useState<Run | null>(null);
  const [underlined, setUnderlined] = React.useState<string[]>([]);
  const [announcement, setAnnouncement] = React.useState("");
  const [accepted, setAccepted] = React.useState(false);
  const shownRef = React.useRef(shown);
  const pending = React.useRef<Promise<unknown> | null>(null);
  const lastEdit = React.useRef<{ label: string; value: string } | null>(null);
  React.useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  const timing = React.useRef({
    rerunDelay,
    streamSpeed,
    underlineHold,
    motionSafe,
  });
  React.useEffect(() => {
    timing.current = { rerunDelay, streamSpeed, underlineHold, motionSafe };
  });

  // Each new set of values runs one rewrite: dissolve the sentences whose
  // words change, wait for the host (or the delay), stream the new words in,
  // then hold the underline. A newer edit cancels the run in flight and starts
  // from whatever is on screen, so nothing ever waits on a stopped step.
  React.useEffect(() => {
    const from = shownRef.current;
    if (signature(from) === targetSig) return;
    const before = textById(from);
    const after = textById(target);
    const changed: string[] = [];
    const old: Record<string, string> = {};
    for (const p of target)
      for (const s of p.sentences) {
        if (before.get(s.id) !== s.text) {
          changed.push(s.id);
          old[s.id] = before.get(s.id) ?? "";
        }
      }
    const {
      rerunDelay: delay,
      streamSpeed: speed,
      underlineHold: hold,
      motionSafe: rich,
    } = timing.current;
    const total = changed.reduce(
      (n, id) => n + splitWords(after.get(id) ?? "").length,
      0,
    );
    const edit = lastEdit.current;
    lastEdit.current = null;
    const timers: number[] = [];
    let alive = true;
    let ticker: number | null = null;
    const at = (ms: number, fn: () => void) =>
      timers.push(window.setTimeout(() => alive && fn(), ms));

    const finish = () => {
      setRun({ phase: "done", changed, old, words: total });
      setUnderlined(changed);
      const lead = edit
        ? `${edit.label} changed to ${edit.value}. `
        : "Answer updated. ";
      setAnnouncement(
        `${lead}${changed.length} ${changed.length === 1 ? "sentence" : "sentences"} rewritten.`,
      );
      at(hold, () => {
        setUnderlined([]);
        setRun(null);
      });
    };

    const stream = () => {
      setShown(target);
      if (!rich || total === 0) {
        finish();
        return;
      }
      let words = 0;
      setRun({ phase: "stream", changed, old, words });
      ticker = window.setInterval(
        () => {
          if (!alive) return;
          words += 1;
          if (words >= total) {
            if (ticker !== null) window.clearInterval(ticker);
            ticker = null;
            finish();
            return;
          }
          setRun({ phase: "stream", changed, old, words });
        },
        Math.max(16, Math.round(1000 / Math.max(1, speed))),
      );
    };

    const raf = window.requestAnimationFrame(() => {
      if (!alive) return;
      setUnderlined([]);
      setAccepted(false);
      if (changed.length === 0) {
        setShown(target);
        setRun(null);
        setAnnouncement("No sentences changed.");
        return;
      }
      setRun({ phase: "dissolve", changed, old, words: 0 });
      const dissolve = rich ? 260 + Math.min(240, changed.length * 40) : 150;
      at(dissolve, () => {
        setRun({ phase: "wait", changed, old, words: 0 });
        const started = Date.now();
        const host = pending.current;
        pending.current = null;
        const go = () => {
          const left = Math.max(0, delay - (Date.now() - started));
          at(rich ? left : 0, stream);
        };
        if (host) {
          // A stopped run never waits on the host: `alive` guards the answer.
          host.then(go, go);
        } else {
          go();
        }
      });
    });

    return () => {
      alive = false;
      window.cancelAnimationFrame(raf);
      for (const t of timers) window.clearTimeout(t);
      if (ticker !== null) window.clearInterval(ticker);
    };
    // `target` is fully described by its signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSig]);

  /* --------------------------- pins, focus -------------------------- */

  const [active, setActive] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [roving, setRoving] = React.useState(0);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<AssumptionValue | null>(null);
  const pinRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const editingRef = React.useRef<string | null>(null);
  const rootRef = React.useRef<HTMLElement | null>(null);
  const lit = hovered ?? active;

  // Focus goes into the editor once it has arrived: the chosen option, or
  // the number field with its value selected.
  React.useEffect(() => {
    if (!editing) return;
    const raf = window.requestAnimationFrame(() => {
      const host = rootRef.current?.querySelector<HTMLElement>(
        `[data-ap-editor="${CSS.escape(editing)}"]`,
      );
      const el = host?.querySelector<HTMLElement>(
        '[aria-checked="true"], input',
      );
      el?.focus();
      if (el instanceof HTMLInputElement) el.select();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [editing]);

  const setValue = (id: string, value: AssumptionValue, reverted: boolean) => {
    const previous = current[id];
    if (previous === value) return;
    const a = assumptions.find((x) => x.id === id);
    const next = { ...current, [id]: value };
    if (a) lastEdit.current = { label: a.label, value: display(a, value) };
    if (values === undefined) setOwnValues(next);
    onValuesChange?.(next);
    if (reverted) {
      onRevert?.(id, value);
    } else if (previous !== undefined) {
      const result = onEditAssumption?.(id, value, previous);
      if (result && typeof (result as Promise<unknown>).then === "function")
        pending.current = result as Promise<unknown>;
    }
  };

  const focusPin = (id: string) => {
    window.requestAnimationFrame(() => pinRefs.current.get(id)?.focus());
  };

  const startEdit = (a: Assumption) => {
    if (disabled || status !== "ready") return;
    editingRef.current = a.id;
    setEditing(a.id);
    setDraft(current[a.id] ?? a.value);
    setActive(a.id);
  };

  const commit = (a: Assumption, value: AssumptionValue | null) => {
    editingRef.current = null;
    setEditing(null);
    setDraft(null);
    if (value !== null) {
      let v = value;
      if (!a.options) {
        const n = num(value, num(a.value, 0));
        v = Math.min(a.max ?? Infinity, Math.max(a.min ?? -Infinity, n));
      }
      setValue(a.id, v, false);
    }
    focusPin(a.id);
  };

  const cancel = (a: Assumption) => {
    editingRef.current = null;
    setEditing(null);
    setDraft(null);
    focusPin(a.id);
  };

  const revert = (a: Assumption) => {
    if (disabled) return;
    setValue(a.id, a.value, true);
  };

  const onPinKey = (
    event: React.KeyboardEvent,
    a: Assumption,
    index: number,
  ) => {
    const go = (i: number) => {
      const n = assumptions.length;
      const k = (i + n) % n;
      setRoving(k);
      const next = assumptions[k];
      if (next) pinRefs.current.get(next.id)?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        go(index + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        go(index - 1);
        break;
      case "Home":
        event.preventDefault();
        go(0);
        break;
      case "End":
        event.preventDefault();
        go(assumptions.length - 1);
        break;
      case "Escape":
        if (current[a.id] !== a.value && !disabled) {
          event.preventDefault();
          revert(a);
        }
        break;
      default:
        break;
    }
  };

  /* ------------------------------ comb ------------------------------ */

  const [wrap, setWrap] = React.useState<HTMLDivElement | null>(null);
  const [answerNode, setAnswerNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  const [pinsNode, setPinsNode] = React.useState<HTMLUListElement | null>(null);
  const [geo, setGeo] = React.useState<{
    comb: string;
    ticks: { x: number; y: number }[];
    bracket: string;
    w: number;
    h: number;
  } | null>(null);
  const runKey = run ? `${run.phase}:${run.changed.join(",")}` : "";
  const conflictKey = found.map((c) => c.pins.join("+")).join(",");

  React.useEffect(() => {
    if (!wrap || !answerNode || !pinsNode) return;
    let raf = 0;
    const measure = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const box = wrap.getBoundingClientRect();
        const answerBox = answerNode.getBoundingClientRect();
        const pinsBox = pinsNode.getBoundingClientRect();
        // The pins sit beside the answer only in the wide layout.
        const side = pinsBox.left >= answerBox.right - 1;
        if (!side) {
          setGeo(null);
          return;
        }
        const xA = r1(answerBox.right - box.left + 4);
        const xP = r1(pinsBox.left - box.left - 4);
        const spine = r1((xA + xP) / 2);
        const centre = (el: Element) => {
          const r = el.getBoundingClientRect();
          return r1(r.top - box.top + r.height / 2);
        };
        let comb = "";
        const ticks: { x: number; y: number }[] = [];
        const pin = lit ? pinRefs.current.get(lit) : undefined;
        if (lit && pin) {
          const ys: number[] = [];
          for (const el of answerNode.querySelectorAll<HTMLElement>(
            "[data-ap-sentence]",
          )) {
            if (!(el.dataset.apDeps ?? "").split(" ").includes(lit)) continue;
            const rect = el.getClientRects()[0];
            if (!rect) continue;
            ys.push(r1(rect.top - box.top + rect.height / 2));
          }
          const py = centre(pin);
          if (ys.length) {
            const all = [...ys, py];
            const top = Math.min(...all);
            const bottom = Math.max(...all);
            const parts = [
              `M ${xP} ${py} H ${spine}`,
              `M ${spine} ${top} V ${bottom}`,
            ];
            for (const y of ys) {
              parts.push(`M ${spine} ${y} H ${xA}`);
              ticks.push({ x: xA, y });
            }
            comb = parts.join(" ");
          }
        }
        let bracket = "";
        const first = found[0];
        if (first) {
          const a = pinRefs.current.get(first.pins[0]);
          const b = pinRefs.current.get(first.pins[1]);
          if (a && b) {
            const ya = centre(a);
            const yb = centre(b);
            // Just outside the column, in the body's right margin.
            const x = r1(pinsBox.right - box.left + 8);
            const top = Math.min(ya, yb);
            const bottom = Math.max(ya, yb);
            bracket = `M ${x - 6} ${top} H ${x} V ${bottom} H ${x - 6}`;
          }
        }
        setGeo({ comb, ticks, bracket, w: r1(box.width), h: r1(box.height) });
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    ro.observe(answerNode);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // `found` is described by the conflict key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrap, answerNode, pinsNode, lit, runKey, editing, conflictKey]);

  /* ------------------------------ styles ---------------------------- */

  const vars = {
    "--ap-accent": accent,
    "--ap-wash": `color-mix(in oklab, ${accent} 14%, transparent)`,
    "--ap-line": `color-mix(in oklab, ${accent} 50%, transparent)`,
    "--ap-solid": `oklch(from ${accent} 0.55 c h)`,
  } as React.CSSProperties;
  const focusRing =
    "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
  const changedCount = assumptions.filter(
    (a) => current[a.id] !== a.value,
  ).length;
  const busy = run !== null && run.phase !== "done";
  const ready = status === "ready";

  /* ----------------------------- sentences -------------------------- */

  const streamOffsets = new Map<string, number>();
  if (run?.phase === "stream") {
    let o = 0;
    for (const p of shown)
      for (const s of p.sentences)
        if (run.changed.includes(s.id)) {
          streamOffsets.set(s.id, o);
          o += splitWords(s.text).length;
        }
  }

  const renderSentence = (s: AnswerSentence, index: number) => {
    const isLit = lit !== null && s.deps.includes(lit);
    const dimmed = highlight === "focus" && lit !== null && !isLit;
    const rewriting = run?.changed.includes(s.id) ? run : null;
    const underline = underlined.includes(s.id);
    const space = index > 0 ? " " : "";
    const litClass = isLit
      ? highlight === "wash"
        ? "bg-(--ap-wash) text-foreground"
        : highlight === "line"
          ? "text-foreground underline decoration-(--ap-accent) decoration-2 underline-offset-[5px]"
          : "text-foreground"
      : "";
    const marker =
      isLit && lit ? (
        <sup
          aria-hidden
          className="ml-0.5 font-mono text-[9px] font-semibold text-(--ap-accent)"
        >
          {assumptions.findIndex((a) => a.id === lit) + 1}
        </sup>
      ) : null;
    const base = cn(
      "rounded-[3px] [box-decoration-break:clone] transition-[background-color,color,opacity] duration-200",
      litClass,
      dimmed && "opacity-40",
    );

    if (
      rewriting &&
      (rewriting.phase === "dissolve" || rewriting.phase === "wait")
    ) {
      const words = splitWords(rewriting.old[s.id] ?? "");
      return (
        <React.Fragment key={s.id}>
          {space}
          <span
            data-ap-sentence=""
            data-ap-deps={s.deps.join(" ")}
            className={cn(
              base,
              rewriting.phase === "wait" &&
                cn("bg-(--ap-wash)", motionSafe && "animate-pulse"),
            )}
          >
            {words.map((w, i) => (
              <React.Fragment key={i}>
                {i > 0 ? " " : null}
                <motion.span
                  className="inline-block"
                  initial={false}
                  animate={
                    motionSafe
                      ? { opacity: 0, filter: "blur(3px)" }
                      : { opacity: 0 }
                  }
                  transition={{
                    duration: motionSafe ? durations.base : durations.fast,
                    ease: easings.exit,
                    delay: motionSafe ? Math.min(0.24, i * 0.012) : 0,
                  }}
                >
                  {w}
                </motion.span>
              </React.Fragment>
            ))}
          </span>
        </React.Fragment>
      );
    }

    if (rewriting && rewriting.phase === "stream") {
      const words = splitWords(s.text);
      const offset = streamOffsets.get(s.id) ?? 0;
      return (
        <React.Fragment key={s.id}>
          {space}
          <span
            data-ap-sentence=""
            data-ap-deps={s.deps.join(" ")}
            className={base}
          >
            {words.map((w, i) => {
              const on = offset + i < rewriting.words;
              return (
                <React.Fragment key={i}>
                  {i > 0 ? " " : null}
                  <motion.span
                    className="inline-block"
                    initial={{
                      opacity: 0,
                      y: distances.nudge * 0.75,
                      filter: "blur(3px)",
                    }}
                    animate={
                      on
                        ? { opacity: 1, y: 0, filter: "blur(0px)" }
                        : {
                            opacity: 0,
                            y: distances.nudge * 0.75,
                            filter: "blur(3px)",
                          }
                    }
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                  >
                    {w}
                  </motion.span>
                </React.Fragment>
              );
            })}
          </span>
        </React.Fragment>
      );
    }

    return (
      <React.Fragment key={s.id}>
        {space}
        <motion.span
          data-ap-sentence=""
          data-ap-deps={s.deps.join(" ")}
          className={cn(
            base,
            "bg-[linear-gradient(var(--ap-accent),var(--ap-accent))] [background-position:0_100%] bg-no-repeat",
          )}
          initial={
            underline && motionSafe ? { backgroundSize: "0% 2px" } : false
          }
          animate={{ backgroundSize: underline ? "100% 2px" : "100% 0px" }}
          transition={
            !motionSafe
              ? { duration: 0 }
              : underline
                ? springs.glide
                : { duration: durations.slow, ease: easings.exit }
          }
        >
          {s.text}
        </motion.span>
        {marker}
      </React.Fragment>
    );
  };

  /* ------------------------------- pins ----------------------------- */

  const pins = (
    <ul
      ref={setPinsNode}
      aria-label="Assumptions"
      className={cn(
        "flex [scrollbar-width:none] gap-2 overflow-x-auto overscroll-x-contain px-4 py-2.5",
        "[mask-image:linear-gradient(to_right,transparent,black_14px,black_calc(100%-14px),transparent)]",
        "@min-[40rem]/assumption-pins:flex-col @min-[40rem]/assumption-pins:gap-2.5 @min-[40rem]/assumption-pins:overflow-visible @min-[40rem]/assumption-pins:[mask-image:none] @min-[40rem]/assumption-pins:p-0",
      )}
    >
      {assumptions.map((a, index) => {
        const value = current[a.id];
        const dirty = value !== a.value;
        const isEditing = editing === a.id;
        const isLit = lit === a.id;
        const clash = conflicted.has(a.id);
        const deps = shown.reduce(
          (n, p) => n + p.sentences.filter((s) => s.deps.includes(a.id)).length,
          0,
        );
        const other = found
          .find((c) => c.pins.includes(a.id))
          ?.pins.find((p) => p !== a.id);
        const otherLabel = other
          ? assumptions.find((x) => x.id === other)?.label
          : undefined;

        const shell = cn(
          "relative flex shrink-0 items-center gap-2 transition-colors duration-200",
          "@min-[40rem]/assumption-pins:flex-col @min-[40rem]/assumption-pins:items-stretch @min-[40rem]/assumption-pins:gap-1.5",
          pinStyle === "tack" &&
            cn(
              "rounded-full border bg-surface-1 py-1 pr-1 pl-1 @min-[40rem]/assumption-pins:rounded-3 @min-[40rem]/assumption-pins:p-2.5 @min-[40rem]/assumption-pins:pl-3",
              clash
                ? "border-warn/60"
                : isLit || isEditing
                  ? "border-(--ap-line)"
                  : "border-hairline",
            ),
          pinStyle === "tag" &&
            cn(
              "rounded-r-2 border border-l-0 bg-surface-2 py-1 pr-1 pl-3 [clip-path:polygon(9px_0,100%_0,100%_100%,9px_100%,0_50%)] @min-[40rem]/assumption-pins:rounded-r-3 @min-[40rem]/assumption-pins:py-2.5 @min-[40rem]/assumption-pins:pr-2.5 @min-[40rem]/assumption-pins:pl-5 @min-[40rem]/assumption-pins:[clip-path:polygon(14px_0,100%_0,100%_100%,14px_100%,0_50%)]",
              clash
                ? "border-warn/60 bg-warn/10"
                : isLit || isEditing
                  ? "border-(--ap-line) bg-(--ap-wash)"
                  : "border-hairline",
            ),
          pinStyle === "rule" &&
            cn(
              "border-b-2 py-1 pr-1 @min-[40rem]/assumption-pins:border-b-0 @min-[40rem]/assumption-pins:border-l-2 @min-[40rem]/assumption-pins:py-1 @min-[40rem]/assumption-pins:pl-3",
              clash
                ? "border-warn"
                : isLit || isEditing
                  ? "border-(--ap-accent)"
                  : "border-hairline-strong",
            ),
        );

        const head = (
          <span
            aria-hidden
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center font-mono text-[10px] font-semibold tabular-nums transition-colors duration-200",
              pinStyle === "tack" &&
                "rounded-full shadow-[inset_0_-1.5px_0_color-mix(in_oklab,black_18%,transparent)]",
              pinStyle === "tag" && "rounded-full",
              pinStyle === "rule" && "rounded-1",
              clash
                ? "bg-warn text-background"
                : isLit || isEditing || pinStyle !== "rule"
                  ? "bg-(--ap-solid) text-primary-foreground"
                  : "bg-surface-2 text-ink-2",
            )}
          >
            {index + 1}
          </span>
        );

        return (
          <li
            key={a.id}
            className="shrink-0 @min-[40rem]/assumption-pins:shrink"
            onPointerEnter={() => setHovered(a.id)}
            onPointerLeave={() => setHovered((h) => (h === a.id ? null : h))}
          >
            <div className={shell}>
              {pinStyle === "tag" ? (
                <span
                  aria-hidden
                  className="absolute top-1/2 left-[5px] size-1.5 -translate-y-1/2 rounded-full bg-card @min-[40rem]/assumption-pins:left-[7px]"
                />
              ) : null}
              <div className="flex min-w-0 items-center gap-2">
                <button
                  ref={(node) => {
                    if (node) pinRefs.current.set(a.id, node);
                    else pinRefs.current.delete(a.id);
                  }}
                  type="button"
                  tabIndex={index === roving ? 0 : -1}
                  aria-label={`${a.label}, ${display(a, value)}${dirty ? `, changed from ${display(a, a.value)}` : ""}${clash && otherLabel ? `, conflicts with ${otherLabel}` : ""}. ${deps} ${deps === 1 ? "sentence depends" : "sentences depend"} on it.`}
                  aria-describedby={hintId}
                  aria-expanded={isEditing}
                  aria-disabled={disabled || !ready || undefined}
                  onFocus={() => {
                    setRoving(index);
                    setActive(a.id);
                  }}
                  onBlur={() =>
                    setActive((v) =>
                      v === a.id && editing !== a.id ? null : v,
                    )
                  }
                  onKeyDown={(event) => onPinKey(event, a, index)}
                  onClick={() => (isEditing ? cancel(a) : startEdit(a))}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-full text-left @min-[40rem]/assumption-pins:rounded-2",
                    focusRing,
                    disabled ? "cursor-not-allowed" : "cursor-pointer",
                  )}
                >
                  {head}
                  <span className="flex min-w-0 items-baseline gap-1.5 @min-[40rem]/assumption-pins:flex-1 @min-[40rem]/assumption-pins:flex-col @min-[40rem]/assumption-pins:gap-0">
                    <span className="truncate text-[11px] whitespace-nowrap text-ink-3 @min-[40rem]/assumption-pins:text-[11px] @min-[40rem]/assumption-pins:tracking-[0.02em]">
                      {a.label}
                    </span>
                    <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap @min-[40rem]/assumption-pins:w-full">
                      <span className="text-[12.5px] font-semibold text-foreground tabular-nums @min-[40rem]/assumption-pins:text-[13.5px]">
                        {display(a, value)}
                      </span>
                      {dirty ? (
                        <span className="hidden text-[11px] text-ink-3 tabular-nums line-through @min-[40rem]/assumption-pins:inline">
                          {display(a, a.value)}
                        </span>
                      ) : a.source ? (
                        <span
                          title={a.source}
                          className="ml-auto hidden min-w-0 truncate text-[10.5px] text-ink-3 @min-[40rem]/assumption-pins:inline"
                        >
                          {a.source}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
                {!isEditing && !disabled && ready ? (
                  dirty ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`Revert ${a.label} to ${display(a, a.value)}`}
                      onClick={() => {
                        revert(a);
                        focusPin(a.id);
                      }}
                      className={cn(
                        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-foreground",
                        focusRing,
                      )}
                    >
                      <Undo2 aria-hidden className="size-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`Edit ${a.label}`}
                      onClick={() => startEdit(a)}
                      className={cn(
                        "hidden size-6 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-foreground @min-[40rem]/assumption-pins:inline-flex",
                        focusRing,
                      )}
                    >
                      <Pencil aria-hidden className="size-3" />
                    </button>
                  )
                ) : null}
              </div>

              <AnimatePresence initial={false}>
                {isEditing ? (
                  <motion.div
                    key="editor"
                    initial={
                      motionSafe
                        ? { opacity: 0, y: -distances.nudge }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe ? springs.snap : { duration: durations.fast }
                    }
                    data-ap-editor={a.id}
                    className="flex items-center"
                  >
                    {a.options ? (
                      <div
                        role="radiogroup"
                        aria-label={a.label}
                        className="flex gap-1 @min-[40rem]/assumption-pins:flex-wrap"
                      >
                        {a.options.map((o) => {
                          const checked = draft === o.value;
                          return (
                            <button
                              key={String(o.value)}
                              type="button"
                              role="radio"
                              aria-checked={checked}
                              tabIndex={checked ? 0 : -1}
                              onClick={() => commit(a, o.value)}
                              onKeyDown={(event) => {
                                const opts = a.options ?? [];
                                const i = opts.findIndex(
                                  (x) => x.value === draft,
                                );
                                const move = (k: number) => {
                                  const next =
                                    opts[(k + opts.length) % opts.length];
                                  if (!next) return;
                                  setDraft(next.value);
                                  const group =
                                    event.currentTarget.parentElement;
                                  window.requestAnimationFrame(() =>
                                    group
                                      ?.querySelector<HTMLButtonElement>(
                                        '[aria-checked="true"]',
                                      )
                                      ?.focus(),
                                  );
                                };
                                if (
                                  event.key === "ArrowRight" ||
                                  event.key === "ArrowDown"
                                ) {
                                  event.preventDefault();
                                  move(i + 1);
                                } else if (
                                  event.key === "ArrowLeft" ||
                                  event.key === "ArrowUp"
                                ) {
                                  event.preventDefault();
                                  move(i - 1);
                                } else if (event.key === "Enter") {
                                  event.preventDefault();
                                  commit(a, draft);
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancel(a);
                                }
                              }}
                              className={cn(
                                "inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-[11.5px] whitespace-nowrap tabular-nums transition-colors duration-150",
                                checked
                                  ? "border-(--ap-line) bg-(--ap-wash) font-semibold text-(--ap-accent)"
                                  : "border-hairline bg-card text-ink-2 hover:text-foreground",
                                o.value === a.value &&
                                  !checked &&
                                  "border-dashed",
                                focusRing,
                              )}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <label className="flex items-center gap-1.5">
                        <span className="sr-only">{a.label}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={a.min}
                          max={a.max}
                          step={a.step ?? 1}
                          value={String(draft ?? "")}
                          onChange={(event) => {
                            const next = event.currentTarget.value;
                            setDraft(next);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commit(a, draft);
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              cancel(a);
                            }
                          }}
                          onBlur={() => {
                            // Escape and Enter close the editor first; only a
                            // real departure commits on blur.
                            if (editingRef.current === a.id) commit(a, draft);
                          }}
                          className={cn(
                            "h-7 w-16 rounded-2 border border-(--ap-line) bg-card px-2 text-[12.5px] text-foreground tabular-nums",
                            focusRing,
                          )}
                        />
                        {a.unit ? (
                          <span aria-hidden className="text-[12px] text-ink-3">
                            {a.unit}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`Apply ${a.label}`}
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => commit(a, draft)}
                          className={cn(
                            "inline-flex size-7 items-center justify-center rounded-2 bg-(--ap-solid) text-primary-foreground",
                            focusRing,
                          )}
                        >
                          <Check aria-hidden className="size-3.5" />
                        </button>
                      </label>
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {clash && otherLabel ? (
                <p className="hidden items-center gap-1 text-[11px] text-warn @min-[40rem]/assumption-pins:flex">
                  <TriangleAlert aria-hidden className="size-3 shrink-0" />
                  {`Conflicts with ${otherLabel}`}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );

  /* ------------------------------ render ---------------------------- */

  const answerText = plainText(shown);
  const parts = model.trim().split(/\s+/);
  const monogram =
    `${parts[0]?.[0] ?? ""}${parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""}`.toUpperCase();
  const conflict = found[0];

  return (
    <section
      ref={rootRef}
      aria-labelledby={titleId}
      className={cn(
        "@container/assumption-pins relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ ...vars, height }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-2 bg-(--ap-wash) font-mono text-[10px] font-semibold text-(--ap-accent)"
          >
            {monogram}
          </span>
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate text-[13.5px] leading-5 font-semibold"
            >
              {model}
            </h2>
            <p className="font-mono text-[10.5px] text-ink-3">
              {`rests on ${assumptions.length} ${assumptions.length === 1 ? "assumption" : "assumptions"}${changedCount ? ` · ${changedCount} changed` : ""}`}
            </p>
          </div>
        </div>
        {busy ? (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-(--ap-wash) px-2 font-mono text-[10.5px] text-(--ap-accent)">
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full bg-(--ap-accent)",
                motionSafe && "animate-pulse",
              )}
            />
            {run?.phase === "stream" ? "rewriting" : "re-running"}
          </span>
        ) : null}
      </header>

      <div className="relative flex-1 overflow-y-auto overscroll-contain">
        {status === "loading" ? (
          <div aria-busy className="flex flex-col gap-3 p-4">
            {[92, 84, 96, 70, 88].map((w, i) => (
              <span
                key={i}
                aria-hidden
                className="h-3 animate-pulse rounded-1 bg-surface-2"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-[13px] text-ink-2">Couldn’t write the answer.</p>
            {onReload ? (
              <button
                type="button"
                onClick={onReload}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-xs hover:bg-surface-2",
                  focusRing,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div
              ref={setWrap}
              className="relative grid grid-cols-1 @min-[40rem]/assumption-pins:grid-cols-[minmax(0,1fr)_15rem] @min-[40rem]/assumption-pins:gap-x-7 @min-[40rem]/assumption-pins:p-4 @min-[75rem]/assumption-pins:grid-cols-[minmax(0,40rem)_17rem] @min-[75rem]/assumption-pins:justify-center"
            >
              <div className="sticky top-0 z-10 col-span-full border-b border-hairline bg-card @min-[40rem]/assumption-pins:static @min-[40rem]/assumption-pins:order-2 @min-[40rem]/assumption-pins:col-span-1 @min-[40rem]/assumption-pins:border-0 @min-[40rem]/assumption-pins:bg-transparent">
                <p className="hidden pb-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[40rem]/assumption-pins:block">
                  Assumptions
                </p>
                {pins}
              </div>
              <div
                ref={setAnswerNode}
                className="flex min-w-0 flex-col gap-3 p-4 @min-[40rem]/assumption-pins:order-1 @min-[40rem]/assumption-pins:p-0"
              >
                <p className="ml-auto max-w-[88%] rounded-3 rounded-tr-1 border border-hairline bg-surface-2 px-3 py-2 text-[13px] leading-[1.55] text-foreground">
                  {question}
                </p>
                <div className="flex flex-col gap-2.5">
                  {shown.map((p) => (
                    <Paragraph
                      key={p.id}
                      motionSafe={motionSafe}
                      className="text-[13.5px] leading-[1.7] text-ink-2"
                    >
                      {p.sentences.map((s, i) => renderSentence(s, i))}
                    </Paragraph>
                  ))}
                </div>
              </div>
              {geo ? (
                <svg
                  aria-hidden
                  className="pointer-events-none absolute inset-0 hidden overflow-visible @min-[40rem]/assumption-pins:block"
                  width={geo.w}
                  height={geo.h}
                >
                  <AnimatePresence>
                    {geo.comb && lit ? (
                      <motion.g
                        key={lit}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={{ duration: durations.fast }}
                      >
                        <motion.path
                          d={geo.comb}
                          fill="none"
                          strokeWidth={1.25}
                          strokeLinecap="round"
                          className="stroke-(--ap-line)"
                          initial={motionSafe ? { pathLength: 0 } : false}
                          animate={{ pathLength: 1 }}
                          transition={
                            motionSafe ? springs.glide : { duration: 0 }
                          }
                        />
                        {geo.ticks.map((t, i) => (
                          <circle
                            key={i}
                            cx={t.x}
                            cy={t.y}
                            r={2}
                            className="fill-(--ap-accent)"
                          />
                        ))}
                      </motion.g>
                    ) : null}
                  </AnimatePresence>
                  {geo.bracket ? (
                    <motion.path
                      d={geo.bracket}
                      fill="none"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="stroke-warn"
                      initial={
                        motionSafe
                          ? { pathLength: 0, opacity: 0 }
                          : { opacity: 0 }
                      }
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={
                        motionSafe
                          ? springs.glide
                          : { duration: durations.fast }
                      }
                    />
                  ) : null}
                </svg>
              ) : null}
            </div>
          </>
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-2.5">
        <p
          className={cn(
            "min-w-0 flex-1 basis-48 items-start gap-1.5 text-[11.5px] leading-4",
            conflict
              ? "flex text-warn"
              : accepted
                ? "flex text-ink-3"
                : "hidden text-ink-3 @min-[30rem]/assumption-pins:flex",
          )}
        >
          {conflict ? (
            <>
              <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              <span>{conflict.reason}</span>
            </>
          ) : (
            <span>
              {accepted
                ? "Answer saved with these assumptions."
                : "Point at a pin to see what rests on it. Enter edits it."}
            </span>
          )}
        </p>
        <button
          type="button"
          aria-disabled={disabled || busy || !!conflict || !ready || undefined}
          aria-describedby={conflict ? `${uid}-why` : undefined}
          onClick={() => {
            if (disabled || busy || conflict || !ready) return;
            setAccepted(true);
            onAcceptAnswer?.(answerText, current);
          }}
          className={cn(
            "ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-colors duration-150",
            disabled || busy || conflict || !ready
              ? "bg-surface-2 text-ink-3"
              : accepted
                ? "border border-(--ap-line) bg-(--ap-wash) text-(--ap-accent)"
                : "bg-(--ap-solid) text-primary-foreground hover:bg-(--ap-accent)",
            focusRing,
          )}
        >
          {accepted ? (
            <motion.span
              initial={motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={
                motionSafe ? springs.flick : { duration: durations.fast }
              }
              className="inline-flex"
            >
              <Check aria-hidden className="size-3.5" />
            </motion.span>
          ) : null}
          {accepted ? "Used" : "Use this answer"}
        </button>
        {conflict ? (
          <span id={`${uid}-why`} className="sr-only">
            {`Resolve the conflict first: ${conflict.reason}`}
          </span>
        ) : null}
      </footer>

      <p id={hintId} className="sr-only">
        Arrow keys move between assumptions. Enter edits one; Escape cancels an
        edit, or reverts a changed assumption.
      </p>
      <p role="status" className="sr-only">
        {announcement}
        {conflict ? ` ${conflict.reason}` : ""}
      </p>
    </section>
  );
}
