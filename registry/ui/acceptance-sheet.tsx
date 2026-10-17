"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ExternalLink,
  FileText,
  RotateCcw,
  Scale,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type AcceptanceVerdict = "pending" | "checking" | "pass" | "fail";

export type AcceptanceEvidence = {
  /** What the evidence is: a query, a check, a file. */
  label: string;
  /** Where it came from. */
  source?: string;
  /** The line that proves it, shown in mono. */
  excerpt?: string;
  /** A link to the evidence itself. */
  href?: string;
};

export type AcceptanceOverride = {
  verdict: "pass" | "fail";
  reason: string;
};

export type AcceptanceCriterion = {
  id: string;
  text: string;
  /** The agent's verdict so far. @default "pending" */
  verdict?: AcceptanceVerdict;
  evidence?: AcceptanceEvidence;
  /** Why it failed, shown under a failed criterion. */
  note?: string;
  /** A person's verdict over the agent's, with the reason. */
  override?: AcceptanceOverride;
};

export type AcceptanceStep = {
  id: string;
  title: string;
  /** One sentence under the heading. */
  summary?: string;
  criteria: AcceptanceCriterion[];
};

export type AcceptanceState = "draft" | "in-progress" | "signed-off";
export type AcceptanceStampStyle = "seal" | "tag" | "tick";
export type AcceptancePaper = "plain" | "ruled" | "grid";
export type AcceptanceStatus = "ready" | "loading" | "error";

export type AcceptanceSheetProps = {
  /** The plan as a short document: steps with criteria under each. @default defaultAcceptanceSteps */
  steps?: AcceptanceStep[];
  /** Draft (criteria editable), in progress (verdicts arriving) or signed off (locked). @default "in-progress" */
  state?: AcceptanceState;
  /** The document's title. @default "Weekly basin report, automated" */
  title?: string;
  /** Who wrote the plan. @default "Basinworks agent" */
  author?: string;
  /** The revision shown beside the author. @default "Rev 3" */
  revision?: string;
  /** Who signed it off and when, shown once signed off. @default { by: "Rae Okafor", at: "Fri 17 Oct, 14:32" } */
  signedOff?: { by: string; at: string };
  /** A criterion's text was edited in draft. */
  onEditCriterion?: (id: string, text: string) => void;
  /** A person overrode a criterion's verdict, with a reason. */
  onOverride?: (id: string, verdict: "pass" | "fail", reason: string) => void;
  /** A criterion's evidence was opened. */
  onOpenEvidence?: (id: string, evidence: AcceptanceEvidence) => void;
  /** "Sign off" was pressed once every criterion passed. */
  onSignOff?: () => void;
  /** What a verified criterion's stamp looks like: a round ink seal, a rectangular tag, or a quiet tick. @default "seal" */
  stampStyle?: AcceptanceStampStyle;
  /** The sheet's ground: plain, ruled lines with a margin rule, or a dot grid. @default "plain" */
  paper?: AcceptancePaper;
  /** Stamps, links and the sign-off seal — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Whether the plan has arrived. @default "ready" */
  status?: AcceptanceStatus;
  /** "Try again" was pressed after the plan failed to load. */
  onRetry?: () => void;
  /** The document's accessible name. @default the title */
  label?: string;
  /** Read only: nothing can be edited, overridden or signed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

/** Basinworks' weekly report automation, part-way through verification. */
export const defaultAcceptanceSteps: AcceptanceStep[] = [
  {
    id: "pull",
    title: "Pull the week’s ledger",
    summary: "Read Monday to Sunday from the Basinworks ledger.",
    criteria: [
      {
        id: "days",
        text: "All seven days are present",
        verdict: "pass",
        evidence: {
          label: "ledger_week.sql",
          source: "Query result",
          excerpt: "7 days · 18,204 entries",
        },
      },
      {
        id: "cutoff",
        text: "Nothing after Sunday 23:59",
        verdict: "pass",
        evidence: {
          label: "Latest entry",
          source: "Ledger",
          excerpt: "Sun 12 Oct, 23:41 · BN-20417",
        },
      },
    ],
  },
  {
    id: "table",
    title: "Build the summary table",
    summary: "One row per region, with the change on last week.",
    criteria: [
      {
        id: "totals",
        text: "Totals match the ledger to the cent",
        verdict: "fail",
        note: "Basin North is $412.06 high: a refund posted twice.",
        evidence: {
          label: "Reconciliation",
          source: "Diff",
          excerpt: "Basin North  42,318.24 vs 41,906.18",
        },
      },
      {
        id: "regions",
        text: "Every region has a row",
        verdict: "pass",
        evidence: {
          label: "Region check",
          source: "Summary table",
          excerpt: "6 of 6 regions",
        },
      },
    ],
  },
  {
    id: "send",
    title: "Send it to finance",
    summary: "Before Monday 09:00, with the CSV attached.",
    criteria: [
      { id: "ontime", text: "Sent before 09:00 on Monday", verdict: "pending" },
      { id: "csv", text: "The CSV is attached", verdict: "pending" },
    ],
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const PAPER: Record<AcceptancePaper, string> = {
  plain: "",
  ruled:
    "bg-[repeating-linear-gradient(to_bottom,transparent_0_23px,color-mix(in_oklab,var(--ac-accent)_13%,transparent)_23px_24px)]",
  grid: "bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_16%,transparent)_1px,transparent_1.4px)] bg-[size:14px_14px]",
};

/** Focus a field the moment it arrives (a stable ref callback, so it runs once). */
const focusOnArrival = (node: HTMLTextAreaElement | null) => {
  if (!node) return;
  node.focus();
  // The whole criterion is selected, so typing rewrites it and arrows edit it.
  node.select();
};

/** A node's height, measured when it arrives and whenever it changes. */
function useMeasured() {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      setHeight(Math.round(node.getBoundingClientRect().height)),
    );
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, height] as const;
}

type Effective = {
  verdict: AcceptanceVerdict;
  overridden: boolean;
  reason?: string;
};

const effectiveOf = (
  c: AcceptanceCriterion,
  local: Record<string, AcceptanceOverride>,
): Effective => {
  const o = local[c.id] ?? c.override;
  if (o) return { verdict: o.verdict, overridden: true, reason: o.reason };
  return { verdict: c.verdict ?? "pending", overridden: false };
};

const VERDICT_WORD: Record<AcceptanceVerdict, string> = {
  pending: "not checked yet",
  checking: "being checked",
  pass: "verified",
  fail: "failed",
};

/* ----------------------------------------------------------------------- */
/*                                  Stamp                                   */
/* ----------------------------------------------------------------------- */

/**
 * The verified mark. It lands like a rubber stamp — from 1.7× and a few
 * degrees off, on the recoil spring, two visible bounces — with a ring of ink
 * spreading and fading under it. Present at mount, it is simply there.
 */
function Stamp({
  style,
  overridden,
  fresh,
  motionSafe,
  onOpen,
  label,
}: {
  style: AcceptanceStampStyle;
  overridden: boolean;
  fresh: boolean;
  motionSafe: boolean;
  onOpen: () => void;
  label: string;
}) {
  const tilt = style === "tag" ? -8 : style === "seal" ? -12 : 0;
  const land = fresh && motionSafe;
  return (
    <motion.button
      type="button"
      tabIndex={-1}
      aria-hidden
      title={label}
      onClick={onOpen}
      className="relative flex shrink-0 cursor-pointer items-center justify-center text-(--ac-ink)"
      initial={
        land
          ? { scale: 1.7, rotate: tilt - 14, opacity: 0 }
          : fresh
            ? { opacity: 0 }
            : false
      }
      animate={{ scale: 1, rotate: tilt, opacity: overridden ? 0.85 : 1 }}
      transition={
        motionSafe
          ? {
              scale: springs.recoil,
              rotate: springs.recoil,
              opacity: { duration: durations.blink },
            }
          : { duration: durations.fast }
      }
    >
      {land ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-(--ac-ink)"
          initial={{ scale: 0.9, opacity: 0.45 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{
            duration: durations.slow,
            ease: easings.enter,
            delay: 0.08,
          }}
        />
      ) : null}
      {style === "tag" ? (
        <span
          className={cn(
            "rounded-1 border-[1.5px] border-current px-1 py-px font-mono text-[9px] leading-none font-semibold tracking-[0.08em] uppercase",
            overridden && "border-dashed",
          )}
        >
          {overridden ? "Overruled" : "Verified"}
        </span>
      ) : style === "seal" ? (
        <span
          className={cn(
            "flex size-[22px] items-center justify-center rounded-full border-[1.5px] border-current",
            overridden && "border-dashed",
          )}
        >
          <span className="flex size-4 items-center justify-center rounded-full border border-[color-mix(in_oklab,currentColor_55%,transparent)]">
            <Check aria-hidden className="size-2.5" strokeWidth={3.5} />
          </span>
        </span>
      ) : (
        <svg aria-hidden viewBox="0 0 20 20" className="size-5">
          <circle
            cx="10"
            cy="10"
            r="8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray={overridden ? "3 2.4" : undefined}
            opacity="0.5"
          />
          <motion.path
            d="M6 10.4 L8.8 13 L14 7.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={land ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={
              motionSafe ? { ...springs.flick, delay: 0.1 } : { duration: 0 }
            }
          />
        </svg>
      )}
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Criterion                                 */
/* ----------------------------------------------------------------------- */

type Panel = "evidence" | "override" | null;

type CriterionRowProps = {
  c: AcceptanceCriterion;
  eff: Effective;
  text: string;
  state: AcceptanceState;
  stampStyle: AcceptanceStampStyle;
  panel: Panel;
  editing: boolean;
  motionSafe: boolean;
  uid: string;
  register: (id: string, node: HTMLButtonElement | null) => void;
  onActivate: () => void;
  onOverrideKey: () => void;
  onOpenEvidence: () => void;
  onCommitEdit: (text: string | null) => void;
  inlinePanel: React.ReactNode;
};

function CriterionRow({
  c,
  eff,
  text,
  state,
  stampStyle,
  panel,
  editing,
  motionSafe,
  uid,
  register,
  onActivate,
  onOverrideKey,
  onOpenEvidence,
  onCommitEdit,
  inlinePanel,
}: CriterionRowProps) {
  const id = c.id;
  const ref = React.useCallback(
    (node: HTMLButtonElement | null) => register(id, node),
    [register, id],
  );
  const [mountVerdict] = React.useState(eff.verdict);
  const [mountOverridden] = React.useState(eff.overridden);
  const changed =
    eff.verdict !== mountVerdict || eff.overridden !== mountOverridden;
  const failed = eff.verdict === "fail";
  const passed = eff.verdict === "pass";
  const [bindNote, noteHeight] = useMeasured();
  const panelId = `${uid}-panel-${id}`;
  const draft = state === "draft";
  const showNote = failed && !draft && (c.note || eff.reason);

  const name = draft
    ? `${text}. Draft criterion; Enter edits it.`
    : `${text} — ${VERDICT_WORD[eff.verdict]}${eff.overridden ? " by override" : ""}.${
        failed && c.note && !eff.overridden ? ` ${c.note}` : ""
      }${eff.reason ? ` Reason: ${eff.reason}` : ""}${
        c.evidence && !draft ? ` Evidence: ${c.evidence.label}.` : ""
      }`;

  return (
    <li className="relative">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={cn(
            "mt-[3px] flex size-3.5 shrink-0 items-center justify-center rounded-1 border transition-colors duration-300",
            draft
              ? "border-hairline-strong"
              : passed
                ? eff.overridden
                  ? "border-dashed border-(--ac-ink) bg-(--ac-wash) text-(--ac-ink)"
                  : "border-transparent bg-(--ac-solid) text-(--ac-on)"
                : failed
                  ? "border-[color-mix(in_oklab,var(--danger)_70%,transparent)] text-danger"
                  : eff.verdict === "checking"
                    ? "border-dashed border-(--ac-ink)"
                    : "border-hairline-strong",
          )}
        >
          {!draft && passed ? (
            <Check className="size-2.5" strokeWidth={3.5} />
          ) : null}
          {!draft && failed ? <X className="size-2.5" strokeWidth={3} /> : null}
        </span>

        {editing ? (
          <textarea
            ref={focusOnArrival}
            defaultValue={text}
            rows={2}
            aria-label="Criterion"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onCommitEdit(null);
              } else if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onCommitEdit(event.currentTarget.value);
              }
            }}
            onBlur={(event) => onCommitEdit(event.currentTarget.value)}
            className="min-w-0 flex-1 resize-none rounded-1 border border-input bg-surface-0 px-1.5 py-0.5 text-[12.5px] leading-[18px] text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
          />
        ) : (
          <button
            ref={ref}
            type="button"
            aria-label={name}
            aria-expanded={draft ? undefined : panel !== null}
            aria-controls={draft ? undefined : panelId}
            aria-keyshortcuts={draft ? undefined : "O"}
            onClick={onActivate}
            onKeyDown={(event) => {
              if (
                (event.key === "o" || event.key === "O") &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.altKey
              ) {
                event.preventDefault();
                onOverrideKey();
              }
            }}
            className={cn(
              "min-w-0 flex-1 rounded-1 text-left text-[12.5px] leading-[18px] transition-colors",
              draft ? "cursor-text" : "cursor-pointer",
              eff.verdict === "pending" ? "text-ink-2" : "text-foreground",
              FOCUS,
            )}
          >
            <motion.span
              className="bg-no-repeat"
              style={{
                backgroundImage:
                  "linear-gradient(var(--danger), var(--danger))",
                backgroundPosition: "0 100%",
              }}
              initial={false}
              animate={{
                backgroundSize: failed && !draft ? "100% 1.5px" : "0% 1.5px",
              }}
              transition={
                motionSafe && changed
                  ? springs.glide
                  : { duration: motionSafe ? 0 : durations.fast }
              }
            >
              {text}
            </motion.span>
            {eff.verdict === "checking" && !draft ? (
              <span className="ml-1.5 font-mono text-[10px] tracking-[0.04em] text-(--ac-ink) uppercase">
                checking
              </span>
            ) : null}
          </button>
        )}

        <span className="flex h-[22px] min-w-[22px] shrink-0 items-start justify-end">
          {passed && !draft ? (
            <Stamp
              key={`${eff.verdict}-${eff.overridden}`}
              style={stampStyle}
              overridden={eff.overridden}
              fresh={changed}
              motionSafe={motionSafe}
              onOpen={onOpenEvidence}
              label={c.evidence ? `Evidence: ${c.evidence.label}` : "Verified"}
            />
          ) : null}
        </span>
      </div>

      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{
          height: showNote ? noteHeight || "auto" : 0,
          opacity: showNote ? 1 : 0,
        }}
        transition={
          motionSafe && changed
            ? { height: springs.glide, opacity: { duration: durations.base } }
            : { duration: changed ? durations.fast : 0 }
        }
      >
        <div ref={bindNote} className="pt-1 pb-0.5 pl-6">
          {showNote ? (
            <p
              className={cn(
                "flex items-start gap-1.5 text-[11.5px] leading-4",
                eff.overridden ? "text-ink-2" : "text-danger",
              )}
            >
              <TriangleAlert aria-hidden className="mt-px size-3 shrink-0" />
              <span>{eff.reason ? `Overridden: ${eff.reason}` : c.note}</span>
            </p>
          ) : null}
        </div>
      </motion.div>

      {passed && eff.reason && !draft ? (
        <p className="pt-1 pl-6 text-[11.5px] leading-4 text-ink-2">
          {`Overridden: ${eff.reason}`}
        </p>
      ) : null}

      <div id={panelId}>{inlinePanel}</div>
    </li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The sheet                                 */
/* ----------------------------------------------------------------------- */

/**
 * A plan written as a short document: numbered steps, a sentence each, and
 * acceptance criteria under them. As the agent works, each criterion gets a
 * verdict; a verified one gets a small stamp that lands on `springs.recoil`
 * and links to its evidence, and a failed one is underlined — a danger rule
 * sweeping under the words on `springs.glide` — and reopens its step: the
 * step's check undraws on `springs.flick`, its chip turns to Reopened and
 * the failure note glides open under the criterion.
 *
 * Every criterion is a button in the Tab order; Enter opens its evidence
 * (inline from 34rem, in a sheet that rises from the bottom below that), O
 * overrides it with a reason, Escape closes and returns focus. In draft,
 * Enter edits a criterion instead. Signed off, the sheet locks under a seal.
 * Under reduced motion stamps and underlines appear in place and panels
 * cross-fade.
 */
export function AcceptanceSheet({
  steps = defaultAcceptanceSteps,
  state = "in-progress",
  title = "Weekly basin report, automated",
  author = "Basinworks agent",
  revision = "Rev 3",
  signedOff = { by: "Rae Okafor", at: "Fri 17 Oct, 14:32" },
  onEditCriterion,
  onOverride,
  onOpenEvidence,
  onSignOff,
  stampStyle = "seal",
  paper = "plain",
  accent = "var(--accent-bright)",
  status = "ready",
  onRetry,
  label,
  disabled = false,
  className,
}: AcceptanceSheetProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const sheetTitleId = `${uid}-sheet-title`;
  const draft = state === "draft";
  const signed = state === "signed-off";

  /* ------------------------------- values ------------------------------- */

  const [overrides, setOverrides] = React.useState<
    Record<string, AcceptanceOverride>
  >({});
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const all = steps.flatMap((s) => s.criteria);
  const effOf = (c: AcceptanceCriterion) => effectiveOf(c, overrides);
  const textOf = (c: AcceptanceCriterion) => edits[c.id] ?? c.text;
  const passed = all.filter((c) => effOf(c).verdict === "pass").length;
  const failed = all.filter((c) => effOf(c).verdict === "fail").length;
  const ready = !draft && !signed && all.length > 0 && passed === all.length;

  /* ------------------------------- panels ------------------------------- */

  const [open, setOpen] = React.useState<{
    id: string;
    panel: Exclude<Panel, null>;
  } | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [focusAsk, setFocusAsk] = React.useState<{
    id: string;
    n: number;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const register = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      rowRefs.current.set(id, node);
    },
    [],
  );
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const inlineRefs = React.useRef(new Map<string, HTMLDivElement | null>());
  const registerInline = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      inlineRefs.current.set(id, node);
    },
    [],
  );
  const [mountState] = React.useState(state);

  // Focus lands after the commit that drew its target.
  React.useEffect(() => {
    if (!focusAsk) return;
    rowRefs.current.get(focusAsk.id)?.focus();
  }, [focusAsk]);

  // An opened panel takes focus to its first control, in whichever form is
  // on screen (inline above 34rem, the sheet below).
  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const sheet = sheetRef.current;
      const scope =
        sheet && sheet.getClientRects().length > 0
          ? sheet
          : inlineRefs.current.get(open.id);
      const first = scope?.querySelector<HTMLElement>(
        open.panel === "override"
          ? "[data-ac-first]"
          : "a[href], button:not([tabindex='-1'])",
      );
      first?.focus();
    }, 30);
    return () => window.clearTimeout(t);
  }, [open]);

  const close = (id: string) => {
    setOpen(null);
    setFocusAsk((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  };

  const activate = (c: AcceptanceCriterion) => {
    if (draft) {
      if (!disabled) setEditing(c.id);
      return;
    }
    if (open?.id === c.id && open.panel === "evidence") {
      setOpen(null);
      return;
    }
    setOpen({ id: c.id, panel: "evidence" });
    if (c.evidence) onOpenEvidence?.(c.id, c.evidence);
  };

  const startOverride = (c: AcceptanceCriterion) => {
    if (draft || signed || disabled) {
      setAnnouncement(
        signed
          ? "The plan is signed off; verdicts are locked."
          : "Overrides open once the agent starts.",
      );
      return;
    }
    setOpen({ id: c.id, panel: "override" });
  };

  const commitEdit = (c: AcceptanceCriterion, next: string | null) => {
    setEditing(null);
    setFocusAsk((f) => ({ id: c.id, n: (f?.n ?? 0) + 1 }));
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === textOf(c)) return;
    setEdits((m) => ({ ...m, [c.id]: trimmed }));
    onEditCriterion?.(c.id, trimmed);
    setAnnouncement(`Criterion changed to: ${trimmed}.`);
  };

  const saveOverride = (
    c: AcceptanceCriterion,
    verdict: "pass" | "fail",
    reason: string,
  ) => {
    setOverrides((m) => ({ ...m, [c.id]: { verdict, reason } }));
    onOverride?.(c.id, verdict, reason);
    setAnnouncement(
      `${textOf(c)} overridden to ${verdict === "pass" ? "verified" : "failed"}.`,
    );
    close(c.id);
  };

  /* --------------------------- announcements ---------------------------- */

  const verdictKey = all
    .map((c) => `${c.id}:${c.verdict ?? "pending"}`)
    .join("|");
  const [prevKey, setPrevKey] = React.useState(verdictKey);
  if (prevKey !== verdictKey) {
    const old = new Map(
      prevKey.split("|").map((pair) => pair.split(":") as [string, string]),
    );
    const said: string[] = [];
    for (const step of steps) {
      for (const c of step.criteria) {
        const was = old.get(c.id);
        const now = c.verdict ?? "pending";
        if (was === now || now === "pending") continue;
        if (now === "pass") said.push(`${textOf(c)} — verified.`);
        else if (now === "fail")
          said.push(`${textOf(c)} — failed. ${step.title} reopened.`);
        else if (now === "checking") said.push(`Checking: ${textOf(c)}.`);
      }
    }
    setPrevKey(verdictKey);
    if (said.length) setAnnouncement(said.join(" "));
  }

  /* ------------------------------- panels ------------------------------- */

  const panelFor = (c: AcceptanceCriterion, inSheet: boolean) => {
    if (!open || open.id !== c.id) return null;
    if (open.panel === "override")
      return (
        <OverrideForm
          key={`${c.id}-override-${inSheet ? "sheet" : "inline"}`}
          criterion={textOf(c)}
          initial={effOf(c).verdict === "pass" ? "fail" : "pass"}
          onSave={(v, r) => saveOverride(c, v, r)}
          onCancel={() => close(c.id)}
        />
      );
    return (
      <EvidenceView
        evidence={c.evidence}
        canOverride={!signed && !disabled}
        onOverride={() => setOpen({ id: c.id, panel: "override" })}
        onOpen={() => c.evidence && onOpenEvidence?.(c.id, c.evidence)}
        onClose={() => close(c.id)}
      />
    );
  };

  const openCriterion = open ? all.find((c) => c.id === open.id) : undefined;

  /* -------------------------------- body -------------------------------- */

  const vars = {
    "--ac-accent": accent,
    "--ac-ink": `color-mix(in oklab, ${accent} 88%, var(--foreground))`,
    "--ac-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
    "--ac-solid": `oklch(from ${accent} 0.56 c h)`,
    "--ac-on": "oklch(0.99 0.004 262)",
  } as React.CSSProperties;

  const chip = draft
    ? { text: "Draft", ink: "text-ink-2", dot: "bg-ink-3" }
    : signed
      ? { text: "Signed off", ink: "text-success", dot: "bg-success" }
      : {
          text: "In progress",
          ink: "text-(--ac-ink)",
          dot: "bg-(--ac-accent)",
        };

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-busy className="flex flex-col gap-3 px-5 py-5">
        <span className="sr-only">Loading the plan</span>
        {[0.5, 0.82, 0.7, 0.44, 0.76].map((w, i) => (
          <span
            key={i}
            aria-hidden
            className="h-2.5 rounded-full bg-surface-2"
            style={{ width: `${Math.round(w * 100)}%` }}
          />
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">The plan did not load.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else if (steps.length === 0) {
    body = (
      <p className="px-5 py-8 text-center text-sm text-ink-2">
        No steps written yet.
      </p>
    );
  } else {
    body = (
      <ol className="relative flex flex-col gap-3.5 px-4 pt-3.5 pb-4 @min-[24rem]/acceptance-sheet:pl-5">
        {steps.map((step, si) => {
          const effs = step.criteria.map(effOf);
          const allPass =
            effs.length > 0 && effs.every((e) => e.verdict === "pass");
          const anyFail = effs.some((e) => e.verdict === "fail");
          const anyCheck = effs.some((e) => e.verdict === "checking");
          const word = draft
            ? "Draft"
            : allPass
              ? "Verified"
              : anyFail
                ? "Reopened"
                : anyCheck
                  ? "Verifying"
                  : "Open";
          return (
            <li key={step.id} className="flex flex-col gap-1.5">
              <h3 className="flex items-center gap-2 text-[13.5px] leading-5 font-semibold text-foreground">
                <StepMark
                  n={si + 1}
                  done={allPass && !draft}
                  failed={anyFail && !draft}
                  motionSafe={motionSafe}
                />
                <span className="min-w-0 flex-1">{step.title}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-px font-mono text-[9.5px] font-medium tracking-[0.06em] uppercase transition-colors duration-300",
                    word === "Verified"
                      ? "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success"
                      : word === "Reopened"
                        ? "bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger"
                        : word === "Verifying"
                          ? "bg-(--ac-wash) text-(--ac-ink)"
                          : "bg-surface-2 text-ink-3",
                  )}
                >
                  {word}
                </span>
              </h3>
              {step.summary ? (
                <p className="sr-only @min-[24rem]/acceptance-sheet:not-sr-only">
                  <span className="block pl-[26px] text-[12px] leading-4 text-ink-2">
                    {step.summary}
                  </span>
                </p>
              ) : null}
              <ul
                aria-label={`${step.title}: acceptance criteria`}
                className="mt-0.5 flex flex-col gap-1.5 pl-2 @min-[24rem]/acceptance-sheet:pl-[26px]"
              >
                {step.criteria.map((c) => (
                  <CriterionRow
                    key={c.id}
                    c={c}
                    eff={effOf(c)}
                    text={textOf(c)}
                    state={state}
                    stampStyle={stampStyle}
                    panel={open?.id === c.id ? open.panel : null}
                    editing={editing === c.id}
                    motionSafe={motionSafe}
                    uid={uid}
                    register={register}
                    onActivate={() => activate(c)}
                    onOverrideKey={() => startOverride(c)}
                    onOpenEvidence={() => activate(c)}
                    onCommitEdit={(next) => commitEdit(c, next)}
                    inlinePanel={
                      <InlinePanel
                        id={c.id}
                        open={open?.id === c.id}
                        motionSafe={motionSafe}
                        register={registerInline}
                      >
                        {panelFor(c, false)}
                      </InlinePanel>
                    }
                  />
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <article
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container/acceptance-sheet relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={vars}
    >
      <div className={cn("relative", PAPER[paper] ?? "")}>
        {paper === "ruled" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-3 w-px bg-[color-mix(in_oklab,var(--danger)_28%,transparent)]"
          />
        ) : null}
        <header className="relative flex flex-col gap-1 border-b border-hairline px-4 pt-3.5 pb-3 @min-[24rem]/acceptance-sheet:pl-5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="font-mono text-[10.5px] tracking-[0.08em] text-ink-3 uppercase">
              <span className="hidden @min-[22rem]/acceptance-sheet:inline">{`${author} · `}</span>
              {revision}
            </p>
            <span
              className={cn(
                "inline-flex h-5 items-center gap-1.5 rounded-full border border-hairline bg-card px-2 text-[10.5px] font-medium",
                chip.ink,
              )}
            >
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", chip.dot)}
              />
              {chip.text}
            </span>
          </div>
          <p id={titleId} className="text-[15px] leading-tight font-semibold">
            {title}
          </p>
          {status === "ready" && all.length ? (
            <p className="font-mono text-[11px] text-ink-3 tabular-nums">
              {draft
                ? `${all.length} criteria to agree`
                : `${passed} of ${all.length} verified${failed ? ` · ${failed} failed` : ""}`}
            </p>
          ) : null}
        </header>

        {body}

        {status === "ready" && all.length ? (
          <footer className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-3 @min-[24rem]/acceptance-sheet:pl-5">
            {signed ? (
              <SignedSeal
                by={signedOff.by}
                at={signedOff.at}
                fresh={mountState !== "signed-off"}
                motionSafe={motionSafe}
              />
            ) : (
              <>
                <span
                  className={cn(
                    "text-[12px] text-ink-3",
                    !draft &&
                      "sr-only @min-[24rem]/acceptance-sheet:not-sr-only",
                  )}
                >
                  {draft
                    ? "Agree the criteria, then let the agent start."
                    : ready
                      ? "Every criterion is verified."
                      : `Sign-off waits on ${all.length - passed} ${all.length - passed === 1 ? "criterion" : "criteria"}.`}
                </span>
                {!draft ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!ready || disabled) {
                        setAnnouncement(
                          `Sign-off waits on ${all.length - passed} ${all.length - passed === 1 ? "criterion" : "criteria"}.`,
                        );
                        return;
                      }
                      onSignOff?.();
                      setAnnouncement("Signed off.");
                    }}
                    aria-disabled={!ready || disabled || undefined}
                    className={cn(
                      "ml-auto inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12.5px] font-medium transition-[background-color,color]",
                      ready
                        ? "bg-(--ac-solid) text-(--ac-on) hover:bg-[color-mix(in_oklab,var(--ac-solid)_88%,black)]"
                        : "bg-surface-2 text-ink-3",
                      FOCUS,
                    )}
                  >
                    <FileText aria-hidden className="size-3.5" />
                    Sign off
                  </button>
                ) : null}
              </>
            )}
          </footer>
        ) : null}
      </div>

      {/* Below 34rem the evidence opens in a sheet that rises from the bottom. */}
      <AnimatePresence>
        {openCriterion ? (
          <motion.div
            key="sheet"
            className="absolute inset-0 z-[5] flex flex-col justify-end @min-[34rem]/acceptance-sheet:hidden"
            exit={{
              opacity: 0,
              transition: { duration: durations.fast, ease: easings.exit },
            }}
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-[color-mix(in_oklab,var(--background)_55%,transparent)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.base, ease: easings.enter }}
              onClick={() => close(openCriterion.id)}
            />
            <motion.div
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={sheetTitleId}
              className="relative rounded-t-4 border-t border-hairline-strong bg-popover px-4 pt-2 pb-4 shadow-raised"
              initial={motionSafe ? { y: "100%" } : { opacity: 0 }}
              animate={motionSafe ? { y: 0 } : { opacity: 1 }}
              transition={
                motionSafe ? springs.glide : { duration: durations.fast }
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  close(openCriterion.id);
                  return;
                }
                if (event.key !== "Tab") return;
                // Keep Tab inside the sheet while it is open.
                const items = [
                  ...event.currentTarget.querySelectorAll<HTMLElement>(
                    "a[href], button:not([tabindex='-1']), textarea, input, [tabindex='0']",
                  ),
                ].filter((el) => !el.hasAttribute("disabled"));
                const first = items[0];
                const last = items[items.length - 1];
                if (!first || !last) return;
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }}
            >
              <span
                aria-hidden
                className="mx-auto mb-2 block h-1 w-9 rounded-full bg-hairline-strong"
              />
              <p
                id={sheetTitleId}
                className="mb-2 text-[12.5px] leading-snug font-semibold text-foreground"
              >
                {textOf(openCriterion)}
              </p>
              {panelFor(openCriterion, true)}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </article>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/** The step's number, which becomes a drawn check when every criterion passes. */
function StepMark({
  n,
  done,
  failed,
  motionSafe,
}: {
  n: number;
  done: boolean;
  failed: boolean;
  motionSafe: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-[18px] shrink-0 items-center justify-center rounded-full border font-mono text-[10px] transition-colors duration-300",
        done
          ? "border-transparent bg-(--ac-solid) text-(--ac-on)"
          : failed
            ? "border-[color-mix(in_oklab,var(--danger)_70%,transparent)] text-danger"
            : "border-hairline-strong text-ink-3",
      )}
    >
      <motion.span
        initial={false}
        animate={{ opacity: done ? 0 : 1 }}
        transition={{ duration: durations.fast }}
      >
        {n}
      </motion.span>
      <svg viewBox="0 0 18 18" className="absolute inset-0 size-full">
        <motion.path
          d="M5.2 9.4 L7.8 12 L12.8 6.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={motionSafe ? springs.flick : { duration: durations.fast }}
        />
      </svg>
    </span>
  );
}

function InlinePanel({
  id,
  open,
  motionSafe,
  register,
  children,
}: {
  id: string;
  open: boolean;
  motionSafe: boolean;
  register: (id: string, node: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  const [measure, height] = useMeasured();
  const bind = React.useCallback(
    (node: HTMLDivElement | null) => {
      measure(node);
      register(id, node);
    },
    [measure, register, id],
  );
  return (
    <motion.div
      className="hidden overflow-hidden @min-[34rem]/acceptance-sheet:block"
      initial={false}
      animate={{ height: open ? height : 0, opacity: open ? 1 : 0 }}
      transition={
        motionSafe
          ? { height: springs.glide, opacity: { duration: durations.base } }
          : { duration: durations.fast }
      }
      inert={!open}
    >
      <div ref={bind} className="pt-2 pb-1 pl-6">
        {open ? (
          <div className="rounded-3 border border-hairline bg-surface-1 p-3">
            {children}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function EvidenceView({
  evidence,
  canOverride,
  onOverride,
  onOpen,
  onClose,
}: {
  evidence?: AcceptanceEvidence;
  canOverride: boolean;
  onOverride: () => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const action = cn(
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2.5 text-[12px] text-foreground transition-colors hover:bg-surface-2",
    FOCUS,
  );
  return (
    <div
      className="flex flex-col gap-2.5"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {evidence ? (
        <>
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {evidence.source
              ? `${evidence.source} · ${evidence.label}`
              : evidence.label}
          </p>
          {evidence.excerpt ? (
            <p className="rounded-2 border border-hairline bg-card px-2.5 py-2 font-mono text-[11.5px] leading-4 break-words text-foreground">
              {evidence.excerpt}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-[12px] text-ink-2">
          No evidence yet — the agent has not checked this.
        </p>
      )}
      <span className="flex flex-wrap items-center gap-1.5">
        {evidence?.href ? (
          <a href={evidence.href} onClick={onOpen} className={action}>
            <ExternalLink aria-hidden className="size-3.5" />
            Open evidence
          </a>
        ) : null}
        {canOverride ? (
          <button type="button" onClick={onOverride} className={action}>
            <Scale aria-hidden className="size-3.5" />
            Override
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "inline-flex h-7 items-center rounded-2 px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          Close
        </button>
      </span>
    </div>
  );
}

function OverrideForm({
  criterion,
  initial,
  onSave,
  onCancel,
}: {
  criterion: string;
  initial: "pass" | "fail";
  onSave: (verdict: "pass" | "fail", reason: string) => void;
  onCancel: () => void;
}) {
  const uid = React.useId();
  const [verdict, setVerdict] = React.useState<"pass" | "fail">(initial);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState(false);
  const radios = React.useRef(new Map<string, HTMLButtonElement | null>());
  const choices: { id: "pass" | "fail"; label: string }[] = [
    { id: "pass", label: "Mark verified" },
    { id: "fail", label: "Mark failed" },
  ];
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason.trim()) {
          setError(true);
          return;
        }
        onSave(verdict, reason.trim());
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div
        role="radiogroup"
        aria-label={`Override for ${criterion}`}
        className="flex flex-wrap gap-1.5"
      >
        {choices.map((choice, i) => {
          const on = verdict === choice.id;
          return (
            <button
              key={choice.id}
              ref={(node) => {
                radios.current.set(choice.id, node);
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              data-ac-first={on ? "" : undefined}
              onClick={() => setVerdict(choice.id)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next = choices[(i + 1) % choices.length];
                if (!next) return;
                setVerdict(next.id);
                radios.current.get(next.id)?.focus();
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-2 border px-2.5 text-[12px] transition-colors",
                on
                  ? choice.id === "pass"
                    ? "border-(--ac-ink) bg-(--ac-wash) text-foreground"
                    : "border-[color-mix(in_oklab,var(--danger)_60%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-foreground"
                  : "border-hairline text-ink-2 hover:bg-surface-2",
                FOCUS,
              )}
            >
              {choice.id === "pass" ? (
                <Check aria-hidden className="size-3.5" />
              ) : (
                <X aria-hidden className="size-3.5" />
              )}
              {choice.label}
            </button>
          );
        })}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11.5px] text-ink-2">
          Reason (kept with the plan)
        </span>
        <textarea
          rows={2}
          value={reason}
          aria-invalid={error || undefined}
          aria-describedby={error ? `${uid}-err` : undefined}
          onChange={(event) => {
            const v = event.currentTarget.value;
            setReason(v);
            if (v.trim()) setError(false);
          }}
          className="resize-none rounded-2 border border-input bg-card px-2 py-1.5 text-[12.5px] leading-[18px] text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid aria-invalid:border-danger"
        />
        {error ? (
          <span id={`${uid}-err`} className="text-[11.5px] text-danger">
            Give a reason so the override can be audited.
          </span>
        ) : null}
      </label>
      <span className="flex items-center gap-1.5">
        <button
          type="submit"
          className={cn(
            "inline-flex h-7 items-center rounded-2 bg-(--ac-solid) px-2.5 text-[12px] font-medium text-(--ac-on) transition-colors hover:bg-[color-mix(in_oklab,var(--ac-solid)_88%,black)]",
            FOCUS,
          )}
        >
          Save override
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "inline-flex h-7 items-center rounded-2 px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          Cancel
        </button>
      </span>
    </form>
  );
}

function SignedSeal({
  by,
  at,
  fresh,
  motionSafe,
}: {
  by: string;
  at: string;
  fresh: boolean;
  motionSafe: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <motion.span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-full border-2 border-(--ac-ink) text-(--ac-ink)"
        initial={
          !fresh
            ? false
            : motionSafe
              ? { scale: 1.6, rotate: -26, opacity: 0 }
              : { opacity: 0 }
        }
        animate={{ scale: 1, rotate: -10, opacity: 1 }}
        transition={
          motionSafe
            ? {
                scale: springs.recoil,
                rotate: springs.recoil,
                opacity: { duration: durations.blink },
              }
            : { duration: durations.fast }
        }
      >
        <span className="flex size-7 items-center justify-center rounded-full border border-[color-mix(in_oklab,currentColor_55%,transparent)]">
          <Check className="size-4" strokeWidth={3} />
        </span>
      </motion.span>
      <span className="flex flex-col">
        <span className="text-[12.5px] font-semibold text-foreground">{`Signed off by ${by}`}</span>
        <span className="font-mono text-[10.5px] text-ink-3">{at}</span>
      </span>
    </div>
  );
}
