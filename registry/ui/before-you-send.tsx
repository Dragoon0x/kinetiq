"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowUpRight,
  CircleAlert,
  LoaderCircle,
  RotateCcw,
  SendHorizontal,
} from "lucide-react";

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

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type HelpArticle = {
  id: string;
  title: string;
  /** One or two sentences: the answer in short. */
  summary: string;
  /** The steps the preview lists, if the answer is a procedure. */
  steps?: string[];
  /** A topic id; matches in the chosen topic rank a little higher. */
  topic: string;
  /** Words and phrases people use for this problem. */
  keywords: string[];
  readMinutes: number;
  /** The full article, opened from the preview. */
  href?: string;
};

export type ContactTopic = { id: string; label: string };

export type ContactDraft = {
  topic: string;
  subject: string;
  details: string;
  email: string;
};

export type ArticleMatch = {
  article: HelpArticle;
  /** 0 to 1. */
  relevance: number;
};

export type BeforeYouSendResultStyle = "cards" | "rows" | "wash";
export type BeforeYouSendDensity = "compact" | "cozy" | "roomy";
export type BeforeYouSendAccent = "cobalt" | "jade" | "amber" | "mono";

type Async<T> = T | Promise<T>;

export type BeforeYouSendProps = {
  /** How the answers are drawn: a row of cards, hairline rows with a meter, or rows whose relevance is a wash behind the title. @default "cards" */
  resultStyle?: BeforeYouSendResultStyle;
  /** Control heights, type and gaps. @default "cozy" */
  density?: BeforeYouSendDensity;
  /** Relevance bars, the active answer, Send and the thank-you ring: cobalt, jade, amber or mono. @default "cobalt" */
  accent?: BeforeYouSendAccent;
  /** The help articles searched as the subject is typed. @default defaultHelpArticles */
  articles?: HelpArticle[];
  /** The topics offered above the subject. @default defaultContactTopics */
  topics?: ContactTopic[];
  /** Controlled draft: topic, subject, details and email. */
  value?: ContactDraft;
  /** Initial draft when uncontrolled. @default { topic: "billing", email: "jun@coldbrook.studio" } */
  defaultValue?: Partial<ContactDraft>;
  /** Fires from every edit with the whole draft. */
  onValueChange?: (draft: ContactDraft) => void;
  /** A settled search (after `searchDelay` ms of quiet). Return matches (or a promise of them) to replace the built-in scoring; a rejection shows a quiet note and never blocks Send. */
  onSearch?: (
    query: string,
    topic: string,
  ) => Async<ArticleMatch[] | void> | undefined;
  /** "This solved it" was chosen: the form closes with a thank-you, and no message is sent. */
  onSolved?: (article: HelpArticle, query: string) => void;
  /** The form was sent. Return a promise to hold Send; resolve { reference } to show it, reject to keep everything and offer Try again. */
  onSend?: (draft: ContactDraft) => Async<{ reference?: string } | void>;
  /** "Read the full article" was pressed in a preview. */
  onOpenArticle?: (article: HelpArticle) => void;
  /** Whose support this is. @default "Fieldline" */
  company?: string;
  /** How soon a message is answered, in words. @default "within a day" */
  responseTime?: string;
  /** The most answers shown. @default 3 */
  maxResults?: number;
  /** Answers below this relevance (0 to 1) are not shown. @default 0.25 */
  minRelevance?: number;
  /** Quiet time after typing before a search runs, ms. @default 160 */
  searchDelay?: number;
  /** The tallest the surface grows, px; past it the form scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be typed, chosen or sent. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultContactTopics: ContactTopic[] = [
  { id: "billing", label: "Billing" },
  { id: "account", label: "Sign-in" },
  { id: "sync", label: "Sync" },
  { id: "other", label: "Something else" },
];

export const defaultHelpArticles: HelpArticle[] = [
  {
    id: "charged-twice",
    title: "Why was I charged twice this month?",
    summary:
      "A second charge is usually a pending authorisation from a plan or card change. It drops off on its own within 3 working days.",
    steps: [
      "Open Settings, then Billing.",
      "Find the charge marked Pending; it isn't a payment yet.",
      "Still there after 3 working days? Reply to your receipt and we'll refund it.",
    ],
    topic: "billing",
    keywords: [
      "charged twice",
      "double charge",
      "duplicate",
      "refund",
      "payment",
      "pending",
      "bill",
    ],
    readMinutes: 2,
    href: "#charged-twice",
  },
  {
    id: "change-card",
    title: "Change the card you pay with",
    summary:
      "Add a new card in Billing and make it the default; your next invoice uses it, and the old card stays on file until you remove it.",
    steps: [
      "Open Settings, then Billing.",
      "Choose Add card and enter the details.",
      "Set it as default, then remove the old card.",
    ],
    topic: "billing",
    keywords: [
      "card",
      "payment method",
      "update card",
      "expired card",
      "new card",
    ],
    readMinutes: 1,
    href: "#change-card",
  },
  {
    id: "invoices",
    title: "Download invoices and receipts",
    summary:
      "Every invoice is a PDF in Billing, with your tax number on it once you've added one.",
    topic: "billing",
    keywords: ["invoice", "receipt", "vat", "tax", "pdf", "bill"],
    readMinutes: 1,
    href: "#invoices",
  },
  {
    id: "reset-password",
    title: "Reset your password",
    summary:
      "Use Forgot password on the sign-in page; the link we send works for 30 minutes.",
    topic: "account",
    keywords: ["password", "reset", "forgot", "locked out", "sign in", "login"],
    readMinutes: 1,
    href: "#reset-password",
  },
  {
    id: "two-step",
    title: "Turn on two-step sign-in",
    summary:
      "Add an authenticator app in Security, then keep the backup codes somewhere safe.",
    topic: "account",
    keywords: ["two-step", "2fa", "authenticator", "code", "security"],
    readMinutes: 2,
    href: "#two-step",
  },
  {
    id: "sync-stuck",
    title: "Sync stuck on Waiting",
    summary:
      "The phone app holds changes until it has a connection. Pull down on the jobs list to retry; anything older than a day needs a sign-out and back in.",
    topic: "sync",
    keywords: [
      "sync",
      "stuck",
      "waiting",
      "offline",
      "phone",
      "app",
      "not updating",
    ],
    readMinutes: 2,
    href: "#sync-stuck",
  },
  {
    id: "export-jobs",
    title: "Export jobs to a spreadsheet",
    summary:
      "Jobs export as CSV from the jobs list, filtered however the list is filtered.",
    topic: "other",
    keywords: ["export", "csv", "spreadsheet", "download", "jobs", "report"],
    readMinutes: 1,
    href: "#export-jobs",
  },
  {
    id: "pause-plan",
    title: "Pause or cancel your plan",
    summary:
      "Pause for up to three months and keep your data, or cancel at the end of the billing period.",
    topic: "billing",
    keywords: [
      "cancel",
      "pause",
      "downgrade",
      "plan",
      "subscription",
      "charge",
    ],
    readMinutes: 2,
    href: "#pause-plan",
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Search                                   */
/* ----------------------------------------------------------------------- */

const STOP = new Set(
  "a an and are as at be but by can do does for from had has have how i if in into is it its me my no not of on or our so than that the their them then there these they this to too was we were what when where which who why will with you your after again".split(
    " ",
  ),
);

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const tokens = (query: string) =>
  words(query).filter((w) => w.length >= 2 && !STOP.has(w));

/** A word matches a token exactly, by prefix while typing, or by a shared stem. */
const hit = (word: string, token: string) =>
  word === token
    ? 1
    : token.length >= 3 && word.startsWith(token)
      ? 0.7
      : word.length >= 4 && token.startsWith(word)
        ? 0.45
        : 0;

/**
 * The built-in ranking: title words count most, keywords next and the summary
 * least; a whole keyword phrase in the query counts again; coverage of the
 * query and the chosen topic lift the score. Deterministic, so the server and
 * the browser rank alike.
 */
export function scoreArticles(
  articles: HelpArticle[],
  query: string,
  topic: string,
): ArticleMatch[] {
  const q = tokens(query);
  if (q.length === 0) return [];
  const lower = ` ${words(query).join(" ")} `;
  return articles
    .map((article) => {
      const title = words(article.title);
      const keys = article.keywords.flatMap(words);
      const summary = words(article.summary);
      let score = 0;
      let covered = 0;
      for (const token of q) {
        const t = Math.max(0, ...title.map((w) => hit(w, token))) * 3;
        const k = Math.max(0, ...keys.map((w) => hit(w, token))) * 2;
        const s = Math.max(0, ...summary.map((w) => hit(w, token))) * 0.75;
        const best = t + k + s;
        if (best > 0) covered += 1;
        score += best;
      }
      for (const phrase of article.keywords)
        if (
          phrase.includes(" ") &&
          lower.includes(` ${words(phrase).join(" ")} `)
        )
          score += 3;
      const coverage = covered / q.length;
      let relevance = (1 - Math.exp(-score / 5)) * (0.7 + 0.3 * coverage);
      if (article.topic === topic) relevance = Math.min(1, relevance * 1.12);
      return { article, relevance: Number(relevance.toFixed(2)) };
    })
    .filter((m) => m.relevance > 0)
    .sort(
      (a, b) =>
        b.relevance - a.relevance ||
        a.article.title.localeCompare(b.article.title),
    );
}

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const ACCENT: Record<BeforeYouSendAccent, Record<string, string>> = {
  cobalt: {
    "--bs-ink": "var(--accent-bright)",
    "--bs-fill": "var(--primary)",
    "--bs-on": "var(--primary-foreground)",
  },
  jade: {
    "--bs-ink": "var(--success)",
    "--bs-fill": "oklch(from var(--success) 0.52 0.12 h)",
    "--bs-on": "var(--primary-foreground)",
  },
  amber: {
    "--bs-ink": "var(--warn)",
    "--bs-fill": "oklch(from var(--warn) 0.8 0.13 h)",
    "--bs-on": "oklch(from var(--warn) 0.26 0.05 h)",
  },
  mono: {
    "--bs-ink": "var(--foreground)",
    "--bs-fill": "var(--foreground)",
    "--bs-on": "var(--background)",
  },
};

type Geometry = {
  control: string;
  text: string;
  label: string;
  gap: string;
  pad: string;
  rows: number;
};

const DENSITY: Record<BeforeYouSendDensity, Geometry> = {
  compact: {
    control: "h-8",
    text: "text-[12.5px]",
    label: "text-[11.5px]",
    gap: "gap-3",
    pad: "p-4",
    rows: 2,
  },
  cozy: {
    control: "h-9",
    text: "text-[13px]",
    label: "text-[12px]",
    gap: "gap-4",
    pad: "p-5",
    rows: 3,
  },
  roomy: {
    control: "h-10",
    text: "text-[14px]",
    label: "text-[12.5px]",
    gap: "gap-5",
    pad: "p-6",
    rows: 4,
  },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_DRAFT: ContactDraft = {
  topic: "billing",
  subject: "",
  details: "",
  email: "jun@coldbrook.studio",
};

const matchLabel = (relevance: number) =>
  relevance >= 0.7
    ? "Strong match"
    : relevance >= 0.45
      ? "Good match"
      : "Possible match";

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FIELD_FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid";
const BUTTON =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12.5px] font-medium whitespace-nowrap transition-[background-color,color,opacity]";
const GHOST = cn(
  BUTTON,
  "h-8 text-ink-2 hover:bg-surface-2 hover:text-foreground",
);
const PRIMARY = cn(
  BUTTON,
  "bg-[var(--bs-fill)] text-[var(--bs-on)] hover:bg-[color-mix(in_oklab,var(--bs-fill)_88%,var(--foreground))]",
);

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

/* ----------------------------------------------------------------------- */
/*                                 Results                                  */
/* ----------------------------------------------------------------------- */

function Bar({
  relevance,
  delay,
  motionSafe,
  className,
}: {
  relevance: number;
  delay: number;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block h-1 overflow-hidden rounded-full bg-hairline-strong",
        className,
      )}
    >
      <motion.span
        className="absolute inset-0 rounded-full bg-[var(--bs-ink)]"
        style={{ originX: 0 }}
        initial={motionSafe ? { scaleX: 0 } : false}
        animate={{ scaleX: relevance }}
        transition={motionSafe ? { ...springs.glide, delay } : { duration: 0 }}
      />
    </span>
  );
}

function Result({
  match,
  index,
  count,
  active,
  optionId,
  style,
  motionSafe,
  onPick,
  onHover,
}: {
  match: ArticleMatch;
  index: number;
  count: number;
  active: boolean;
  optionId: string;
  style: BeforeYouSendResultStyle;
  motionSafe: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  const { article, relevance } = match;
  const beat = index * cascade(count);
  const label = matchLabel(relevance);
  const pct = `${Math.round(relevance * 100)}%`;
  return (
    <motion.li
      layout={motionSafe ? "position" : false}
      id={optionId}
      role="option"
      aria-selected={active}
      aria-label={`${article.title}, ${label.toLowerCase()}, ${article.readMinutes} min read`}
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={onHover}
      onClick={onPick}
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? {
              layout: springs.glide,
              y: { ...springs.glide, delay: beat },
              opacity: { duration: durations.base, delay: beat },
            }
          : { duration: durations.fast }
      }
      className={cn(
        "relative cursor-pointer overflow-hidden transition-colors",
        style === "cards" &&
          "flex flex-col gap-1.5 rounded-3 border p-3 @max-[30rem]/before-you-send:gap-1 @max-[30rem]/before-you-send:px-3 @max-[30rem]/before-you-send:py-2",
        style !== "cards" && "flex items-center gap-3 rounded-2 px-3 py-2",
        style === "cards" &&
          (active
            ? "border-[color-mix(in_oklab,var(--bs-ink)_55%,transparent)] bg-[color-mix(in_oklab,var(--bs-ink)_7%,transparent)]"
            : "border-hairline bg-surface-0 hover:border-hairline-strong"),
        style !== "cards" &&
          (active
            ? "bg-[color-mix(in_oklab,var(--bs-ink)_10%,transparent)]"
            : "hover:bg-surface-2"),
      )}
    >
      {style === "wash" ? (
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0 w-full bg-[color-mix(in_oklab,var(--bs-ink)_12%,transparent)]"
          style={{ originX: 0 }}
          initial={motionSafe ? { scaleX: 0 } : false}
          animate={{ scaleX: relevance }}
          transition={
            motionSafe
              ? { ...springs.glide, delay: beat + 0.08 }
              : { duration: 0 }
          }
        />
      ) : null}
      {style === "cards" ? (
        <>
          <span className="line-clamp-2 text-[13px] leading-[1.3] font-semibold text-foreground @max-[30rem]/before-you-send:line-clamp-1 @max-[30rem]/before-you-send:text-[12.5px]">
            {article.title}
          </span>
          <span className="line-clamp-2 text-[11.5px] leading-[1.4] text-ink-2 @max-[30rem]/before-you-send:hidden">
            {article.summary}
          </span>
          <span className="mt-auto flex items-center gap-2 pt-0.5">
            <Bar
              relevance={relevance}
              delay={beat + 0.08}
              motionSafe={motionSafe}
              className="flex-1"
            />
            <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums @max-[30rem]/before-you-send:hidden">
              {label}
            </span>
          </span>
        </>
      ) : (
        <>
          <span className="relative flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] leading-5 font-medium text-foreground">
              {article.title}
            </span>
            {style === "rows" ? (
              <span className="line-clamp-1 text-[11.5px] leading-4 text-ink-2 @max-[30rem]/before-you-send:hidden">
                {article.summary}
              </span>
            ) : null}
            {style === "rows" ? (
              <Bar
                relevance={relevance}
                delay={beat + 0.08}
                motionSafe={motionSafe}
                className="mt-1 hidden @max-[30rem]/before-you-send:block"
              />
            ) : null}
          </span>
          {style === "rows" ? (
            <span className="relative flex shrink-0 items-center gap-2 @max-[30rem]/before-you-send:hidden">
              <Bar
                relevance={relevance}
                delay={beat + 0.08}
                motionSafe={motionSafe}
                className="w-16"
              />
              <span className="w-8 text-right font-mono text-[10.5px] text-ink-3 tabular-nums">
                {pct}
              </span>
            </span>
          ) : (
            <span className="relative shrink-0 font-mono text-[10.5px] text-ink-3 tabular-nums">
              {article.readMinutes} min
            </span>
          )}
        </>
      )}
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The surface                               */
/* ----------------------------------------------------------------------- */

type View = "form" | "solved" | "sent";

/**
 * A contact form that answers while you write in. As the subject is typed, a
 * search runs after a short quiet (the built-in ranking, or the host's
 * `onSearch`), and the articles that match slide up between the subject and
 * the rest of the form: the panel's measured height opens on `springs.glide`,
 * each answer rises 8px in `cascade()` order, and each relevance bar grows to
 * its relevance a beat after its row. As the query changes the answers
 * re-rank in place on glide and their bars re-tween.
 *
 * Choosing an answer opens it in the same panel; "This solved it" closes the
 * form with a thank-you instead of a ticket — the form's height glides down
 * to the card, a ring lands on `springs.recoil` and a check draws on
 * `springs.flick`. When nothing matches the form simply continues; a search
 * that fails says so quietly and never blocks Send. The subject is a combobox
 * over a listbox: Down and Up move through the answers, Enter opens one,
 * Escape hides them. Under reduced motion everything appears in place, bars
 * already at their width.
 */
export function BeforeYouSend({
  resultStyle = "cards",
  density = "cozy",
  accent = "cobalt",
  articles = defaultHelpArticles,
  topics = defaultContactTopics,
  value,
  defaultValue,
  onValueChange,
  onSearch,
  onSolved,
  onSend,
  onOpenArticle,
  company = "Fieldline",
  responseTime = "within a day",
  maxResults = 3,
  minRelevance = 0.25,
  searchDelay = 160,
  height = 540,
  disabled = false,
  className,
}: BeforeYouSendProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const geo = DENSITY[density] ?? DENSITY.cozy;
  const listId = `${uid}-answers`;

  /* ------------------------------- draft -------------------------------- */

  const [own, setOwn] = React.useState<ContactDraft>(() => ({
    ...DEFAULT_DRAFT,
    ...defaultValue,
  }));
  const draft = value ?? own;
  const draftRef = React.useRef(draft);
  React.useEffect(() => {
    draftRef.current = draft;
  });
  const update = (patch: Partial<ContactDraft>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  /* ------------------------------- search ------------------------------- */

  const [matches, setMatches] = React.useState<ArticleMatch[]>([]);
  const [searched, setSearched] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [preview, setPreview] = React.useState<HelpArticle | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const seq = React.useRef(0);
  const live = React.useRef({ onSearch, articles, maxResults, minRelevance });
  React.useEffect(() => {
    live.current = { onSearch, articles, maxResults, minRelevance };
  });

  const query = draft.subject.trim();
  const enough = tokens(query).length > 0 && query.length >= 3;

  // One search per pause in typing; an answer that arrives after a newer
  // search started is dropped by its sequence number.
  React.useEffect(() => {
    const id = ++seq.current;
    const t = window.setTimeout(
      () => {
        if (!enough) {
          setMatches([]);
          setSearched("");
          setSearching(false);
          setSearchError(false);
          return;
        }
        const {
          onSearch: search,
          articles: list,
          maxResults: max,
          minRelevance: min,
        } = live.current;
        const settle = (found: ArticleMatch[]) => {
          if (seq.current !== id) return;
          const shown = found
            .filter((m) => m.relevance >= min)
            .slice(0, Math.max(1, max))
            .map((m) => ({
              ...m,
              relevance: Number(
                Math.min(1, Math.max(0, m.relevance)).toFixed(2),
              ),
            }));
          setMatches(shown);
          setSearched(query);
          setSearching(false);
          setSearchError(false);
        };
        let result: ReturnType<NonNullable<BeforeYouSendProps["onSearch"]>>;
        try {
          result = search?.(query, draftRef.current.topic);
        } catch {
          result = Promise.reject(new Error("search failed"));
        }
        if (result && typeof (result as Promise<unknown>).then === "function") {
          setSearching(true);
          (result as Promise<ArticleMatch[] | void>).then(
            (found) =>
              settle(
                found ?? scoreArticles(list, query, draftRef.current.topic),
              ),
            () => {
              if (seq.current !== id) return;
              setSearching(false);
              setSearchError(true);
              setMatches([]);
              setSearched(query);
            },
          );
        } else {
          settle(
            (result as ArticleMatch[] | undefined) ??
              scoreArticles(list, query, draftRef.current.topic),
          );
        }
      },
      enough ? Math.max(0, searchDelay) : 0,
    );
    return () => window.clearTimeout(t);
  }, [query, enough, draft.topic, searchDelay]);

  // A new query undoes Escape and starts the arrow keys over.
  const [seenQuery, setSeenQuery] = React.useState(query);
  if (seenQuery !== query) {
    setSeenQuery(query);
    setDismissed(false);
    setActive(-1);
  }

  // Each settled search is announced once, and only when what it found
  // changed: a count, nothing, or an outage.
  const verdict = searchError
    ? "error"
    : !searched
      ? "idle"
      : matches.length
        ? `found:${matches.length}`
        : "none";
  const [seenVerdict, setSeenVerdict] = React.useState(verdict);
  if (seenVerdict !== verdict) {
    setSeenVerdict(verdict);
    if (verdict === "error")
      setAnnouncement("Suggestions aren't loading. You can still send.");
    else if (verdict === "none")
      setAnnouncement("No articles matched. Tell us more below.");
    else if (verdict.startsWith("found"))
      setAnnouncement(
        `${matches.length} ${matches.length === 1 ? "article" : "articles"} might answer this. Press Down to read them.`,
      );
  }

  const open = matches.length > 0 && !dismissed;
  const showPanel = open || preview !== null;
  const activeMatch = active >= 0 ? matches[active] : undefined;

  /* -------------------------------- views ------------------------------- */

  const [view, setView] = React.useState<View>("form");
  const [solvedWith, setSolvedWith] = React.useState<HelpArticle | null>(null);
  const [reference, setReference] = React.useState<string | null>(null);
  const [sendState, setSendState] = React.useState<
    "idle" | "sending" | "failed"
  >("idle");
  const [errors, setErrors] = React.useState<
    Partial<Record<"subject" | "details" | "email", string>>
  >({});

  const subjectRef = React.useRef<HTMLInputElement | null>(null);
  const focusNext = React.useRef<"preview" | "subject" | "view" | null>(null);
  const [previewHeading, setPreviewHeading] =
    React.useState<HTMLElement | null>(null);
  const [viewHeading, setViewHeading] = React.useState<HTMLElement | null>(
    null,
  );
  const [subjectNode, setSubjectNode] = React.useState<HTMLInputElement | null>(
    null,
  );
  const bindSubject = React.useCallback((node: HTMLInputElement | null) => {
    subjectRef.current = node;
    setSubjectNode(node);
  }, []);
  React.useEffect(() => {
    if (focusNext.current === "preview" && previewHeading?.isConnected) {
      focusNext.current = null;
      previewHeading.focus({ preventScroll: true });
    }
  }, [previewHeading]);
  React.useEffect(() => {
    if (focusNext.current === "view" && viewHeading?.isConnected) {
      focusNext.current = null;
      viewHeading.focus({ preventScroll: true });
    }
  }, [viewHeading]);
  // Back from a thank-you, the form remounts; focus goes to its subject
  // once that node arrives.
  React.useEffect(() => {
    if (
      focusNext.current === "subject" &&
      subjectNode?.isConnected &&
      view === "form"
    ) {
      focusNext.current = null;
      subjectNode.focus({ preventScroll: true });
    }
  }, [subjectNode, view]);

  const openPreview = (article: HelpArticle) => {
    focusNext.current = "preview";
    setPreview(article);
  };
  // The subject stays mounted under a preview, so focus goes straight back.
  const closePreview = () => {
    setPreview(null);
    subjectRef.current?.focus({ preventScroll: true });
  };

  const solve = (article: HelpArticle) => {
    if (disabled) return;
    setSolvedWith(article);
    setPreview(null);
    focusNext.current = "view";
    setView("solved");
    onSolved?.(article, query);
    setAnnouncement(`Glad that helped. Nothing was sent to ${company}.`);
  };

  const validate = () => {
    const d = draftRef.current;
    const next: typeof errors = {};
    if (!d.subject.trim())
      next.subject = "Add a subject, a few words is enough.";
    if (d.details.trim().length < 10)
      next.details = "Tell us a little more, so we can help first time.";
    if (!EMAIL.test(d.email.trim()))
      next.email = "Enter an address like name@company.com.";
    setErrors(next);
    return next;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || sendState === "sending") return;
    const found = validate();
    const firstBad = (["subject", "details", "email"] as const).find(
      (k) => found[k],
    );
    if (firstBad) {
      document.getElementById(`${uid}-${firstBad}`)?.focus();
      setAnnouncement(found[firstBad] ?? "");
      return;
    }
    const land = (result: { reference?: string } | void) => {
      setReference(result && result.reference ? result.reference : null);
      setSendState("idle");
      focusNext.current = "view";
      setView("sent");
      setAnnouncement(
        `Message sent. We'll reply to ${draftRef.current.email} ${responseTime}.`,
      );
    };
    const result = onSend?.(draftRef.current);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSendState("sending");
      (result as Promise<{ reference?: string } | void>).then(land, () => {
        setSendState("failed");
        setAnnouncement("Couldn't send. Everything you wrote is still here.");
      });
    } else {
      land(result as { reference?: string } | void);
    }
  };

  const backToForm = () => {
    focusNext.current = "subject";
    setView("form");
    setSolvedWith(null);
  };

  const startOver = () => {
    update({ subject: "", details: "" });
    setErrors({});
    setReference(null);
    focusNext.current = "subject";
    setView("form");
  };

  /* ------------------------------ keyboard ------------------------------ */

  const onSubjectKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setDismissed(true);
        setActive(-1);
      }
      return;
    }
    if (!open) {
      // Down brings hidden answers back, straight onto the first one.
      if (event.key === "ArrowDown" && dismissed && matches.length) {
        event.preventDefault();
        setDismissed(false);
        setActive(0);
      }
      return;
    }
    const count = matches.length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((a) => (a + 1 >= count ? 0 : a + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => (a <= 0 ? -1 : a - 1));
    } else if (event.key === "Home" && active >= 0) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && active >= 0) {
      event.preventDefault();
      setActive(count - 1);
    } else if (event.key === "Enter" && activeMatch) {
      event.preventDefault();
      openPreview(activeMatch.article);
    }
  };

  const topicRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const onTopicKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    let next = i;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (i + 1) % topics.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (i - 1 + topics.length) % topics.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = topics.length - 1;
    else return;
    event.preventDefault();
    const target = topics[next];
    if (!target) return;
    if (!disabled) update({ topic: target.id });
    topicRefs.current.get(target.id)?.focus();
  };

  /* ------------------------------- layout ------------------------------- */

  const [bindPanel, panelHeight] = useMeasured();
  const [bindView, viewHeight] = useMeasured();
  const accentVars = (ACCENT[accent] ?? ACCENT.cobalt) as React.CSSProperties;

  const fieldBox = (invalid: boolean) =>
    cn(
      "w-full rounded-2 border bg-surface-0 px-3 text-foreground placeholder:text-ink-3 transition-colors",
      invalid
        ? "border-[color-mix(in_oklab,var(--danger)_55%,transparent)]"
        : "border-input",
      geo.text,
      FIELD_FOCUS,
    );
  const labelCls = cn("font-medium text-foreground", geo.label);
  const errorLine = (key: "subject" | "details" | "email") =>
    errors[key] ? (
      <p
        id={`${uid}-${key}-error`}
        className="flex items-center gap-1.5 text-[11.5px] leading-4 text-danger"
      >
        <CircleAlert aria-hidden className="size-3.5 shrink-0" />
        {errors[key]}
      </p>
    ) : null;

  const quiet =
    query.length > 0 && !enough
      ? null
      : searching
        ? "Looking for answers…"
        : searchError
          ? "Suggestions aren't loading. You can still send."
          : verdict === "none"
            ? "Nothing matched. Tell us more below."
            : open
              ? null
              : dismissed && matches.length
                ? `${matches.length} ${matches.length === 1 ? "answer" : "answers"} hidden. Press Down to show them.`
                : null;

  const panel = (
    <motion.div
      className="overflow-hidden"
      initial={false}
      animate={{
        height: showPanel ? panelHeight : 0,
        opacity: showPanel ? 1 : 0,
      }}
      transition={
        motionSafe
          ? {
              height: springs.glide,
              opacity: { duration: durations.base, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
    >
      <div ref={bindPanel} className="pt-1">
        <div className="rounded-3 border border-hairline bg-surface-1 p-2">
          {preview ? (
            <motion.div
              key={preview.id}
              className="flex flex-col gap-2.5 p-2"
              initial={{ opacity: 0, x: motionSafe ? distances.shift : 0 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                motionSafe
                  ? { x: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closePreview();
                }
              }}
            >
              <h3
                ref={setPreviewHeading}
                tabIndex={-1}
                className="text-[14px] leading-5 font-semibold text-foreground outline-none"
              >
                {preview.title}
              </h3>
              <p className={cn("leading-[1.5] text-ink-2", geo.text)}>
                {preview.summary}
              </p>
              {preview.steps?.length ? (
                <ol
                  className={cn(
                    "flex list-decimal flex-col gap-1 pl-5 leading-[1.45] text-foreground marker:text-ink-3",
                    geo.text,
                  )}
                >
                  {preview.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => solve(preview)}
                  aria-disabled={disabled || undefined}
                  className={cn(PRIMARY, FOCUS, geo.control)}
                >
                  This solved it
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  className={cn(GHOST, FOCUS)}
                >
                  <ArrowLeft aria-hidden className="size-3.5" />
                  Back to answers
                </button>
                {preview.href ? (
                  <a
                    href={preview.href}
                    onClick={() => onOpenArticle?.(preview)}
                    className={cn(
                      GHOST,
                      FOCUS,
                      "ml-auto text-[var(--bs-ink)] hover:text-[var(--bs-ink)]",
                    )}
                  >
                    Full article
                    <ArrowUpRight aria-hidden className="size-3.5" />
                  </a>
                ) : null}
              </div>
            </motion.div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="flex items-center justify-between gap-2 px-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                <span>Might answer it</span>
                <span
                  aria-hidden
                  className="hidden @min-[24rem]/before-you-send:inline"
                >
                  ↓ to read · esc hides
                </span>
              </p>
              <ul
                role="listbox"
                id={listId}
                aria-label="Articles that might answer this"
                className={cn(
                  resultStyle === "cards"
                    ? "grid grid-cols-1 gap-2 @min-[36rem]/before-you-send:grid-cols-3"
                    : "flex flex-col gap-0.5",
                )}
              >
                {matches.map((match, i) => (
                  <Result
                    key={match.article.id}
                    match={match}
                    index={i}
                    count={matches.length}
                    active={i === active}
                    optionId={`${uid}-opt-${match.article.id}`}
                    style={resultStyle}
                    motionSafe={motionSafe}
                    onHover={() => {
                      if (active !== i) setActive(i);
                    }}
                    onPick={() => openPreview(match.article)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  const form = (
    <motion.form
      key="form"
      noValidate
      onSubmit={submit}
      className={cn("flex flex-col", geo.gap)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      transition={{ duration: durations.base }}
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend id={`${uid}-topic`} className={cn(labelCls, "mb-1.5")}>
          Topic
        </legend>
        <div
          role="radiogroup"
          aria-labelledby={`${uid}-topic`}
          className="flex flex-wrap gap-1.5"
        >
          {topics.map((topic, i) => {
            const chosen = draft.topic === topic.id;
            const tabbable =
              chosen || (!topics.some((t) => t.id === draft.topic) && i === 0);
            return (
              <button
                key={topic.id}
                ref={(node) => {
                  topicRefs.current.set(topic.id, node);
                }}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-disabled={disabled || undefined}
                tabIndex={tabbable ? 0 : -1}
                onClick={() => {
                  if (!disabled) update({ topic: topic.id });
                }}
                onKeyDown={(event) => onTopicKey(event, i)}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-[12px] font-medium transition-colors",
                  chosen
                    ? "border-[color-mix(in_oklab,var(--bs-ink)_55%,transparent)] bg-[color-mix(in_oklab,var(--bs-ink)_12%,transparent)] text-foreground"
                    : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                {topic.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="relative flex flex-col gap-1.5">
        <label htmlFor={`${uid}-subject`} className={labelCls}>
          Subject
        </label>
        <div className="relative">
          <input
            ref={bindSubject}
            id={`${uid}-subject`}
            type="text"
            autoComplete="off"
            value={draft.subject}
            readOnly={disabled}
            role="combobox"
            aria-expanded={open && preview === null}
            aria-controls={open && preview === null ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={
              activeMatch && preview === null
                ? `${uid}-opt-${activeMatch.article.id}`
                : undefined
            }
            aria-invalid={errors.subject ? true : undefined}
            aria-describedby={
              [
                errors.subject ? `${uid}-subject-error` : "",
                quiet ? `${uid}-subject-note` : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            placeholder="What's it about?"
            onChange={(event) => {
              const next = event.currentTarget.value;
              update({ subject: next });
              if (errors.subject)
                setErrors((e) => ({ ...e, subject: undefined }));
              if (preview) setPreview(null);
            }}
            onKeyDown={onSubjectKey}
            className={cn(
              fieldBox(Boolean(errors.subject)),
              geo.control,
              "pr-9",
            )}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-3"
          >
            {searching ? (
              <LoaderCircle className="size-3.5 motion-safe:animate-spin" />
            ) : null}
          </span>
        </div>
        {errorLine("subject")}
        <AnimatePresence initial={false} mode="popLayout">
          {quiet ? (
            <motion.p
              key={quiet}
              id={`${uid}-subject-note`}
              className="text-[11.5px] leading-4 text-ink-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base }}
            >
              {quiet}
            </motion.p>
          ) : null}
        </AnimatePresence>
        {panel}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-details`} className={labelCls}>
          Details
        </label>
        <textarea
          id={`${uid}-details`}
          rows={geo.rows}
          value={draft.details}
          readOnly={disabled}
          aria-invalid={errors.details ? true : undefined}
          aria-describedby={errors.details ? `${uid}-details-error` : undefined}
          placeholder="What happened, and what did you expect?"
          onChange={(event) => {
            const next = event.currentTarget.value;
            update({ details: next });
            if (errors.details)
              setErrors((e) => ({ ...e, details: undefined }));
          }}
          className={cn(
            fieldBox(Boolean(errors.details)),
            "resize-none py-2 leading-[1.45]",
          )}
        />
        {errorLine("details")}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-email`} className={labelCls}>
          Reply to
        </label>
        <div className="flex flex-col gap-2 @min-[30rem]/before-you-send:flex-row">
          <input
            id={`${uid}-email`}
            type="email"
            autoComplete="email"
            value={draft.email}
            readOnly={disabled}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? `${uid}-email-error` : undefined}
            onChange={(event) => {
              const next = event.currentTarget.value;
              update({ email: next });
              if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
            }}
            className={cn(
              fieldBox(Boolean(errors.email)),
              geo.control,
              "min-w-0 flex-1",
            )}
          />
          <button
            type="submit"
            aria-disabled={disabled || sendState === "sending" || undefined}
            aria-busy={sendState === "sending" || undefined}
            className={cn(
              PRIMARY,
              FOCUS,
              geo.control,
              "px-4",
              disabled && "opacity-50",
            )}
          >
            <SendHorizontal aria-hidden className="size-3.5" />
            {sendState === "sending"
              ? "Sending…"
              : sendState === "failed"
                ? "Try again"
                : "Send message"}
          </button>
        </div>
        {errorLine("email")}
        {sendState === "failed" ? (
          <p className="flex items-center gap-1.5 text-[11.5px] leading-4 text-danger">
            <CircleAlert aria-hidden className="size-3.5 shrink-0" />
            Couldn&apos;t send. Everything you wrote is still here.
          </p>
        ) : null}
      </div>
    </motion.form>
  );

  const ending = (kind: "solved" | "sent") => (
    <motion.div
      key={kind}
      className="flex flex-col items-center gap-3 py-6 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{ duration: durations.base, delay: motionSafe ? 0.12 : 0 }}
    >
      <motion.span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--bs-ink)_14%,transparent)] text-[var(--bs-ink)]"
        initial={{ scale: motionSafe ? 0.6 : 1 }}
        animate={{ scale: 1 }}
        transition={
          motionSafe ? { ...springs.recoil, delay: 0.12 } : { duration: 0 }
        }
      >
        <svg viewBox="0 0 24 24" className="size-6">
          <motion.path
            d="M6 12.5 10.2 16.5 18 8"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: motionSafe ? 0 : 1 }}
            animate={{ pathLength: 1 }}
            transition={
              motionSafe ? { ...springs.flick, delay: 0.3 } : { duration: 0 }
            }
          />
        </svg>
      </motion.span>
      <h3
        ref={setViewHeading}
        tabIndex={-1}
        className="text-[16px] leading-6 font-semibold text-foreground outline-none"
      >
        {kind === "solved" ? "Glad that sorted it" : "Message sent"}
      </h3>
      <p className={cn("max-w-sm leading-[1.5] text-ink-2", geo.text)}>
        {kind === "solved"
          ? `“${solvedWith?.title ?? "That article"}” answered it, so nothing was sent to ${company}. If it comes back, you can write in again.`
          : `We'll reply to ${draft.email} ${responseTime}.${reference ? ` Your reference is ${reference}.` : ""}`}
      </p>
      <button
        type="button"
        onClick={kind === "solved" ? backToForm : startOver}
        className={cn(GHOST, FOCUS, "border border-input bg-surface-1")}
      >
        <RotateCcw aria-hidden className="size-3.5" />
        {kind === "solved" ? "Write in anyway" : "Send another"}
      </button>
    </motion.div>
  );

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className={cn(
        "@container/before-you-send relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ ...accentVars, maxHeight: height }}
    >
      <header
        className={cn(
          "flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-hairline",
          geo.pad,
          "py-3.5",
        )}
      >
        <h2 id={`${uid}-title`} className="text-[15px] leading-5 font-semibold">
          Contact {company} support
        </h2>
        <p className="text-[11.5px] leading-4 text-ink-3">
          We reply {responseTime}. Answers show up as you type.
        </p>
      </header>
      <motion.div layoutScroll className="overflow-y-auto overscroll-contain">
        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={{ height: viewHeight || "auto" }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <div ref={bindView} className={cn("relative", geo.pad)}>
            <AnimatePresence initial={false} mode="popLayout">
              {view === "form" ? form : ending(view)}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
