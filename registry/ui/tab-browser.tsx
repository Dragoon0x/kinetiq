"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TabBrowserSkin = "light" | "dark" | "glass";

export type TabBrowserPage = {
  /** The page's address, e.g. "fieldline.app/routes". Links to it may be written with or without the protocol. */
  url: string;
  /** The tab's title. */
  title: string;
  /** The page itself. Plain `<a href>` links to other pages' addresses navigate inside the frame. */
  content: React.ReactNode;
  /** The tab's icon, 14px. Defaults to the title's first letter. */
  icon?: React.ReactNode;
};

export type TabBrowserProps = {
  /** The site the browser can show. The first page is home: new tabs open on it. */
  pages: TabBrowserPage[];
  /** The browser's accessible name. @default "Browser" */
  label?: string;
  /** How many tabs are open, 1 to 4, on the first pages in order. Changing it opens or closes tabs at the end. @default 3 */
  tabs?: number;
  /** Controlled address: the active tab's URL. A new value navigates the active tab there. */
  value?: string;
  /** Initial address when uncontrolled. @default the first page's URL */
  defaultValue?: string;
  /** Fires from the link, key, button or tab that asked for a new address, before it is shown. */
  onValueChange?: (url: string) => void;
  /** Light or dark chrome and pages, whatever the page's theme; or translucent chrome over the page, in the page's theme. @default "glass" */
  skin?: TabBrowserSkin;
  /** Navigations take a moment, with a loading bar and a spinning tab. Off: pages change at once. @default true */
  loading?: boolean;
  /** Play the clicks. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Tab = {
  id: string;
  /** This tab's history; `entries[index]` is its address. */
  entries: string[];
  index: number;
  /** The address whose page is on screen: behind the address while it loads. */
  shown: string;
  /** New on every page shown, so the page cross-fades. */
  nav: number;
  loading: boolean;
};

type Browser = { tabs: Tab[]; active: string; seq: number };

type Intent = {
  kind: "push" | "back" | "forward" | "switch" | "reload";
  tabId: string;
  url: string;
  /** The address types itself into the bar. */
  typed: boolean;
};

type Api = {
  sync: (location: string) => void;
  typeAddress: () => void;
};

/** The tab strip and the toolbar, px. */
const STRIP = 32;
const CHROME = 68;
const MAX_TABS = 6;
const TAB_MAX = 176;
/** One character of a typed address, s. */
const TYPE_S = 0.024;

const r2 = (v: number) => Math.round(v * 100) / 100;

const norm = (u: string) =>
  u
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");

const hostOf = (u: string) => {
  const cut = u.indexOf("/");
  return cut === -1 ? u : u.slice(0, cut);
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** How long an address takes to load, ms: the same for the same address. */
const loadTime = (url: string) => 380 + (hash(url) % 320);

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

function Glyph({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 shrink-0", className)}
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  back: "M9.5 3.5 5 8l4.5 4.5M5.5 8H13",
  forward: "M6.5 3.5 11 8l-4.5 4.5M10.5 8H3",
  reload: "M12.6 6.2A5 5 0 1 0 13 9.5M12.8 2.8v3.6H9.2",
  plus: "M8 3.5v9M3.5 8h9",
  close: "M5 5l6 6M11 5l-6 6",
  lock: "M5.2 7.2V5.6a2.8 2.8 0 0 1 5.6 0v1.6M4.4 7.2h7.2v5.4H4.4z",
};

function Favicon({
  title,
  icon,
  loading,
  spin,
}: {
  title: string;
  icon?: React.ReactNode;
  loading: boolean;
  spin: boolean;
}) {
  if (loading) {
    return (
      <svg
        aria-hidden
        viewBox="0 0 14 14"
        className={cn(
          "size-3.5 shrink-0 text-cobalt-bright",
          spin && "animate-spin",
        )}
      >
        <circle
          cx="7"
          cy="7"
          r="5.4"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="1.6"
        />
        <path
          d="M7 1.6a5.4 5.4 0 0 1 5.4 5.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (icon !== undefined) {
    return (
      <span
        aria-hidden
        className="flex size-3.5 shrink-0 items-center justify-center"
      >
        {icon}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-3.5 shrink-0 items-center justify-center rounded-1 bg-cobalt-wash text-[9px] leading-none font-semibold text-cobalt-bright"
    >
      {title.charAt(0).toUpperCase()}
    </span>
  );
}

type TabItemProps = {
  tab: Tab;
  title: string;
  icon?: React.ReactNode;
  slot: number;
  count: number;
  width: MotionValue<string>;
  active: boolean;
  domId: string;
  panelId: string;
  motionSafe: boolean;
  disabled: boolean;
  closable: boolean;
  bind: (node: HTMLButtonElement | null) => void;
  onPress: (event: React.PointerEvent | React.MouseEvent) => void;
  /** The dragged tab is over slot `to`, coming from `from`. */
  onReorder: (to: number, from: number) => void;
  onDragEnd: () => void;
  onClose: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

/**
 * One tab. Its slot is a motion value of its own, so tabs glide to new slots;
 * a dragged tab sets its slot at once and carries the difference in its drag
 * offset, so it stays under the finger while the others slide past it.
 */
function TabItem({
  tab,
  title,
  icon,
  slot,
  count,
  width,
  active,
  domId,
  panelId,
  motionSafe,
  disabled,
  closable,
  bind,
  onPress,
  onReorder,
  onDragEnd,
  onClose,
  onKeyDown,
}: TabItemProps) {
  const pos = useMotionValue(slot);
  const dragX = useMotionValue(0);
  const lift = useMotionValue(0);
  const shown = React.useRef(slot);
  const drag = React.useRef<{ from: number; w: number; slot: number } | null>(
    null,
  );
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const [held, setHeld] = React.useState(false);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  React.useEffect(() => {
    if (shown.current === slot) return;
    shown.current = slot;
    if (drag.current || !motionSafe) {
      anims.current.get("pos")?.stop();
      pos.set(slot);
      return;
    }
    run("pos", animate(pos, slot, springs.glide));
  }, [slot, motionSafe, pos]);

  // StrictMode re-runs a moved element's effects: the cleanup stops what is
  // running, and the re-run carries it on to rest rather than leaving the
  // tab frozen part-way through a glide.
  React.useEffect(() => {
    const running = anims.current;
    if (!drag.current) {
      const glide = motionSafe ? springs.glide : { duration: 0 };
      if (Math.abs(dragX.get()) > 0.01) {
        running.set("dragX", animate(dragX, 0, glide));
      }
      if (Math.abs(lift.get()) > 0.001) {
        running.set("lift", animate(lift, 0, glide));
      }
      if (Math.abs(pos.get() - shown.current) > 0.001) {
        running.set("pos", animate(pos, shown.current, glide));
      }
    }
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, [dragX, lift, pos, motionSafe]);

  const gesture = useDrag({
    axis: "x",
    threshold: 5,
    disabled: disabled || count < 2,
    onStart: ({ event }) => {
      const el = event.currentTarget as Element | null;
      const w = el?.parentElement?.getBoundingClientRect().width ?? 80;
      drag.current = { from: slot, w: Math.max(1, w), slot };
      setHeld(true);
      if (motionSafe) run("lift", animate(lift, 1, springs.flick));
    },
    onMove: ({ offset }) => {
      const d = drag.current;
      if (!d) return;
      const raw = d.from * d.w + offset.x;
      const span = (count - 1) * d.w;
      const x = rubberClamp(raw, 0, span, d.w);
      const next = Math.min(count - 1, Math.max(0, Math.round(x / d.w)));
      if (next !== d.slot) {
        const from = d.slot;
        d.slot = next;
        anims.current.get("pos")?.stop();
        pos.set(next);
        onReorder(next, from);
      }
      dragX.set(r2(x - d.slot * d.w));
    },
    onEnd: ({ velocity }) => {
      drag.current = null;
      setHeld(false);
      if (motionSafe) {
        run(
          "dragX",
          animate(dragX, 0, { ...springs.glide, velocity: velocity.x }),
        );
        run("lift", animate(lift, 0, springs.glide));
      } else {
        dragX.set(0);
        lift.set(0);
      }
      onDragEnd();
    },
    onCancel: () => {
      drag.current = null;
      setHeld(false);
      dragX.set(0);
      lift.set(0);
      onDragEnd();
    },
  });

  const x = useTransform(pos, (p) => `${r2(p * 100)}%`);
  const scale = useTransform(lift, (l) => r2(1 + 0.03 * l));
  const shadow = useTransform(lift, (l) =>
    l < 0.01
      ? "none"
      : `0 ${r2(4 * l)}px ${r2(12 * l)}px color-mix(in oklab, black ${Math.round(22 * l)}%, transparent)`,
  );

  return (
    <motion.div
      role="presentation"
      className={cn(
        "group/tab-browser-tab [container-type:inline-size] absolute top-0 left-0 h-full",
        held ? "z-20" : active ? "z-10" : "z-0",
      )}
      style={{ width, x }}
    >
      <motion.div
        className={cn(
          "relative h-full rounded-t-2 transition-colors",
          active
            ? "bg-[var(--tab-browser-bar)]"
            : "group-hover/tab-browser-tab:bg-[var(--tab-browser-hover)]",
        )}
        style={{ x: dragX, scale, boxShadow: shadow }}
      >
        <button
          ref={bind}
          type="button"
          role="tab"
          id={domId}
          aria-selected={active}
          aria-controls={panelId}
          tabIndex={active ? 0 : -1}
          disabled={disabled}
          {...gesture}
          onPointerDown={(event) => {
            gesture.onPointerDown(event);
            if (disabled) return;
            if (event.pointerType === "mouse" && event.button !== 0) return;
            // A real browser selects a tab as it is pressed, not released.
            onPress(event);
          }}
          onClick={(event) => {
            if (event.detail === 0) onPress(event);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "flex h-full w-full min-w-0 touch-pan-y items-center gap-1.5 rounded-t-2 pl-2.5 text-left text-[11px] select-none",
            closable ? "pr-6" : "pr-2.5",
            FOCUS_RING_IN,
            active ? "text-foreground" : "text-ink-2",
            disabled ? "cursor-not-allowed" : "cursor-default",
          )}
        >
          <Favicon
            title={title}
            icon={icon}
            loading={tab.loading}
            spin={motionSafe}
          />
          <span className="min-w-0 flex-1 truncate @max-[52px]:hidden">
            {title}
          </span>
        </button>
        {closable ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Close ${title}`}
            disabled={disabled}
            onClick={onClose}
            className={cn(
              "absolute top-1/2 right-1 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded-1 text-ink-3 transition-opacity",
              "hover:bg-[var(--tab-browser-hover)] hover:text-foreground disabled:cursor-not-allowed",
              active
                ? "opacity-100"
                : "opacity-0 group-hover/tab-browser-tab:opacity-100 @max-[71px]:hidden",
            )}
          >
            <Glyph d={ICONS.close} className="size-3" />
          </button>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

/** What a tab shows at an address no page answers to. */
function Nowhere({
  address,
  home,
}: {
  address: string;
  home?: TabBrowserPage;
}) {
  return (
    <div className="flex flex-col items-start gap-2 px-5 py-6">
      <p className="text-sm font-medium text-foreground">
        Nothing at this address
      </p>
      <p className="font-mono text-xs break-all text-ink-3">{address}</p>
      {home ? (
        <a
          href={home.url}
          className={cn(
            "rounded-1 text-xs text-cobalt-bright underline-offset-2 hover:underline",
            FOCUS_RING,
          )}
        >
          Go to {home.title}
        </a>
      ) : null}
    </div>
  );
}

/**
 * A browser window around a small site, and it behaves like one. Tabs switch
 * on press and drag to reorder: the dragged tab lifts and follows the finger
 * while the others glide out of its way. Each tab keeps its own history, so
 * Back and Forward work; links inside a page navigate the tab (with Ctrl or
 * Cmd, or the middle button, they open a new tab behind it), and the address
 * types itself into the bar from where it first differs. With `loading` a bar
 * runs across under the toolbar, the tab's icon spins, and the new page
 * cross-fades in over the old one when it arrives.
 *
 * The address bar is a real input: type an address, a path or a page's name
 * and press Enter. The tabs are a real tablist — arrows move between them,
 * Shift with an arrow moves the tab, Delete closes it — and Back, Forward,
 * Reload and New tab are buttons. Under reduced motion tabs swap places at
 * once, the address appears whole and pages cross-fade on opacity alone,
 * while the loading bar still fills.
 */
export function TabBrowser({
  pages,
  label = "Browser",
  tabs: tabCount = 3,
  value,
  defaultValue,
  onValueChange,
  skin = "glass",
  loading = true,
  sound = false,
  disabled = false,
  className,
}: TabBrowserProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const panelId = `${uid}-panel`;
  const glass = skin === "glass";
  const home = pages[0];

  const byUrl = React.useMemo(() => {
    const map = new Map<string, TabBrowserPage>();
    for (const p of pages) map.set(norm(p.url), p);
    return map;
  }, [pages]);

  const pageOf = (url: string): TabBrowserPage =>
    byUrl.get(norm(url)) ?? {
      url,
      title: "Not found",
      content: <Nowhere address={url} home={home} />,
    };

  const wanted = Math.min(MAX_TABS, Math.max(1, Math.round(tabCount)));
  const urlAt = (i: number) =>
    norm(pages[i % Math.max(1, pages.length)]?.url ?? "about:blank");

  const [state, setState] = React.useState<Browser>(() => {
    const start = norm(value ?? defaultValue ?? urlAt(0));
    const list: Tab[] = Array.from({ length: wanted }, (_, i) => {
      const url = i === 0 ? start : urlAt(i);
      return {
        id: `t${i + 1}`,
        entries: [url],
        index: 0,
        shown: url,
        nav: 0,
        loading: false,
      };
    });
    return { tabs: list, active: "t1", seq: wanted };
  });
  const [own, setOwn] = React.useState(() =>
    norm(value ?? defaultValue ?? urlAt(0)),
  );
  const controlled = value !== undefined;
  const location = controlled ? norm(value) : own;

  // The tab count is a prop: when it changes, tabs open or close at the end
  // (never the one in use), here in render rather than in an effect.
  const [seenCount, setSeenCount] = React.useState(wanted);
  if (seenCount !== wanted) {
    setSeenCount(wanted);
    setState((s) => {
      let list = s.tabs;
      let seq = s.seq;
      while (list.length < wanted) {
        seq += 1;
        const url = urlAt(list.length);
        list = [
          ...list,
          {
            id: `t${seq}`,
            entries: [url],
            index: 0,
            shown: url,
            nav: 0,
            loading: false,
          },
        ];
      }
      while (list.length > wanted) {
        const cut = [...list].reverse().find((t) => t.id !== s.active);
        if (!cut) break;
        list = list.filter((t) => t.id !== cut.id);
      }
      return { ...s, tabs: list, seq };
    });
  }

  const [draft, setDraft] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const active = state.tabs.find((t) => t.id === state.active) ?? state.tabs[0];
  const address = active ? (active.entries[active.index] ?? "") : "";
  const canBack = !!active && active.index > 0;
  const canForward = !!active && active.index < active.entries.length - 1;
  const tabDomId = (id: string) => `${uid}-tab-${id}`;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const tabNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const timers = React.useRef(new Map<string, number>());
  const pending = React.useRef<Intent | null>(null);
  const shownLocation = React.useRef(location);
  const typeNext = React.useRef<{ url: string; from: number } | null>(null);
  const focusNext = React.useRef<string | null>(null);
  const order = React.useRef<string[] | null>(null);
  const [dragOrder, setDragOrder] = React.useState<string[] | null>(null);
  const api = React.useRef<Api | null>(null);

  // How much of the address is still to type: 0 when it reads in full.
  const hidden = useMotionValue(0);
  const typing = React.useRef<AnimationPlaybackControls | null>(null);
  const count = useMotionValue(state.tabs.length);
  const counting = React.useRef<AnimationPlaybackControls | null>(null);

  const click = (pitch: number, gain: number, el?: Element | null) => {
    const rect = el?.getBoundingClientRect();
    audio.play("click", {
      pitch,
      gain,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  const titleOf = (url: string) => pageOf(url).title;

  /* ---------------------------- loading pages ---------------------------- */

  const showNow = (tabId: string, url: string) => {
    setState((s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, shown: url, nav: t.nav + 1, loading: false }
          : t,
      ),
    }));
  };

  const load = (tabId: string, url: string) => {
    window.clearTimeout(timers.current.get(tabId));
    timers.current.delete(tabId);
    if (!loading) {
      showNow(tabId, url);
      return;
    }
    setState((s) => ({
      ...s,
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, loading: true } : t)),
    }));
    say(`Loading ${titleOf(url)}.`);
    timers.current.set(
      tabId,
      window.setTimeout(() => {
        timers.current.delete(tabId);
        showNow(tabId, url);
        say(`${titleOf(url)} loaded.`);
      }, loadTime(url)),
    );
  };

  /* ------------------------------ navigation ----------------------------- */

  /** Carries out a navigation the host has agreed to (or that changes nothing it owns). */
  const apply = (intent: Intent) => {
    const { kind, tabId, url } = intent;
    const prev = address;
    if (kind === "switch") {
      setState((s) => ({ ...s, active: tabId }));
    } else if (kind !== "reload") {
      setState((s) => ({
        ...s,
        active: tabId,
        tabs: s.tabs.map((t) => {
          if (t.id !== tabId) return t;
          if (kind === "back") return { ...t, index: Math.max(0, t.index - 1) };
          if (kind === "forward") {
            return {
              ...t,
              index: Math.min(t.entries.length - 1, t.index + 1),
            };
          }
          return {
            ...t,
            entries: [...t.entries.slice(0, t.index + 1), url],
            index: t.index + 1,
          };
        }),
      }));
    }
    shownLocation.current = url;
    if (intent.typed && motionSafe) {
      let from = 0;
      while (
        from < prev.length &&
        from < url.length &&
        prev[from] === url[from]
      ) {
        from += 1;
      }
      typeNext.current = { url, from };
    } else {
      typeNext.current = null;
    }
    if (kind !== "switch") load(tabId, url);
  };

  /** Asks the host for a new address; carried out when its value arrives. */
  const ask = (intent: Intent) => {
    if (disabled) return;
    if (intent.url === location) {
      apply(intent);
      return;
    }
    pending.current = intent;
    if (!controlled) setOwn(intent.url);
    onValueChange?.(intent.url);
  };

  const sync = (now: string) => {
    if (now === shownLocation.current) return;
    const p = pending.current;
    pending.current = null;
    if (p && p.url === now) {
      apply(p);
      return;
    }
    // The host moved: the active tab goes there, typed.
    apply({ kind: "push", tabId: state.active, url: now, typed: true });
  };

  const navigate = (raw: string, typed: boolean) => {
    if (!active) return;
    const url = resolve(raw);
    if (!url) return;
    ask({
      kind: url === address ? "reload" : "push",
      tabId: active.id,
      url,
      typed,
    });
  };

  /** An address, a path on this site, or a page's name. */
  const resolve = (raw: string): string | null => {
    const text = raw.trim();
    if (!text) return null;
    if (text.startsWith("/")) return norm(`${hostOf(address)}${text}`);
    const bare = norm(text);
    if (bare.includes(".") || bare.includes("/")) return bare;
    const named = pages.find(
      (p) =>
        p.title.toLowerCase() === bare || norm(p.url).split("/").pop() === bare,
    );
    return named ? norm(named.url) : norm(`${hostOf(address)}/${bare}`);
  };

  const switchTo = (id: string) => {
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab || id === state.active) return;
    ask({
      kind: "switch",
      tabId: id,
      url: tab.entries[tab.index] ?? "",
      typed: false,
    });
  };

  const newTab = (url: string, background: boolean) => {
    if (disabled || state.tabs.length >= MAX_TABS) return;
    const id = `t${state.seq + 1}`;
    const at = norm(url);
    setState((s) => ({
      ...s,
      seq: s.seq + 1,
      tabs: [
        ...s.tabs,
        { id, entries: [at], index: 0, shown: at, nav: 0, loading: false },
      ],
    }));
    if (background) {
      load(id, at);
      say(`Opened ${titleOf(at)} in a new tab.`);
      return;
    }
    focusNext.current = id;
    ask({ kind: "switch", tabId: id, url: at, typed: false });
  };

  const closeTab = (id: string) => {
    if (disabled || state.tabs.length < 2) return;
    const i = state.tabs.findIndex((t) => t.id === id);
    if (i === -1) return;
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    const rest = state.tabs.filter((t) => t.id !== id);
    const closing = state.tabs[i];
    click(0.8, 0.5, tabNodes.current.get(id));
    if (id !== state.active) {
      setState((s) => ({ ...s, tabs: s.tabs.filter((t) => t.id !== id) }));
      return;
    }
    // Closing the tab in use hands over to its right-hand neighbour (or its
    // left): that is not a choice, so it happens now and is then reported.
    const next = rest[Math.min(i, rest.length - 1)];
    if (!next) return;
    const url = next.entries[next.index] ?? "";
    setState((s) => ({
      ...s,
      active: next.id,
      tabs: s.tabs.filter((t) => t.id !== id),
    }));
    focusNext.current = next.id;
    shownLocation.current = url;
    typeNext.current = null;
    say(
      `Closed ${closing ? titleOf(closing.entries[closing.index] ?? "") : "tab"}.`,
    );
    if (url !== location) {
      if (!controlled) setOwn(url);
      onValueChange?.(url);
    }
  };

  const moveTab = (id: string, to: number) => {
    setState((s) => {
      const from = s.tabs.findIndex((t) => t.id === id);
      if (from === -1 || from === to) return s;
      const list = [...s.tabs];
      const [tab] = list.splice(from, 1);
      if (!tab) return s;
      list.splice(Math.min(list.length, Math.max(0, to)), 0, tab);
      return { ...s, tabs: list };
    });
  };

  /**
   * While a tab is dragged only the slots change: moving its node in the
   * document would drop the pointer the drag holds. The order is committed
   * when it is let go.
   */
  const preview = (id: string, to: number) => {
    const ids = order.current ?? state.tabs.map((t) => t.id);
    const list = ids.filter((x) => x !== id);
    list.splice(Math.min(list.length, Math.max(0, to)), 0, id);
    order.current = list;
    setDragOrder(list);
  };

  const commitOrder = (id: string) => {
    const ids = order.current;
    order.current = null;
    setDragOrder(null);
    if (!ids) return;
    setState((s) => {
      const list = ids
        .map((x) => s.tabs.find((t) => t.id === x))
        .filter((t): t is Tab => !!t);
      for (const t of s.tabs) if (!list.includes(t)) list.push(t);
      return { ...s, tabs: list };
    });
    const i = ids.indexOf(id);
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab || i === -1) return;
    say(
      `${titleOf(tab.entries[tab.index] ?? "")} moved to position ${i + 1} of ${ids.length}.`,
    );
  };

  const goBack = (el?: Element | null) => {
    if (!active || !canBack) return;
    click(0.95, 0.5, el);
    ask({
      kind: "back",
      tabId: active.id,
      url: active.entries[active.index - 1] ?? "",
      typed: false,
    });
  };
  const goForward = (el?: Element | null) => {
    if (!active || !canForward) return;
    click(1.05, 0.5, el);
    ask({
      kind: "forward",
      tabId: active.id,
      url: active.entries[active.index + 1] ?? "",
      typed: false,
    });
  };

  /* ------------------------------ the strip ------------------------------ */

  const onTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    // Alt with an arrow is history, handled by the browser as a whole.
    if (event.altKey) return;
    const list = state.tabs;
    const i = list.findIndex((t) => t.id === id);
    if (i === -1) return;
    const focusAt = (j: number) => {
      const t = list[(j + list.length) % list.length];
      if (!t) return;
      tabNodes.current.get(t.id)?.focus();
      click(1.2, 0.35, tabNodes.current.get(t.id));
      switchTo(t.id);
    };
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const d = event.key === "ArrowRight" ? 1 : -1;
      if (event.shiftKey) {
        const to = i + d;
        if (to < 0 || to >= list.length) return;
        click(d > 0 ? 1.1 : 0.9, 0.4, event.currentTarget);
        focusNext.current = id;
        moveTab(id, to);
        const tab = list[i];
        if (tab) {
          say(
            `${titleOf(tab.entries[tab.index] ?? "")} moved to position ${to + 1} of ${list.length}.`,
          );
        }
        return;
      }
      focusAt(i + d);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusAt(event.key === "Home" ? 0 : list.length - 1);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      closeTab(id);
    }
  };

  /* ------------------------------ the page ------------------------------- */

  const linkOf = (event: React.MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const a = target.closest("a[href]");
    if (!a || !event.currentTarget.contains(a)) return null;
    return a;
  };

  const onPageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const a = linkOf(event);
    if (!a) return;
    // Nothing inside the frame ever leaves it.
    event.preventDefault();
    if (disabled || event.button !== 0) return;
    const url = resolve(a.getAttribute("href") ?? "");
    if (!url) return;
    if (event.metaKey || event.ctrlKey) {
      click(1.3, 0.4, a);
      newTab(url, true);
      return;
    }
    click(1.15, 0.5, a);
    navigate(url, true);
  };

  const onPageAuxClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const a = linkOf(event);
    if (!a) return;
    event.preventDefault();
    if (disabled || event.button !== 1) return;
    const url = resolve(a.getAttribute("href") ?? "");
    if (!url) return;
    click(1.3, 0.4, a);
    newTab(url, true);
  };

  /* ------------------------------- effects ------------------------------- */

  const typeAddress = () => {
    const next = typeNext.current;
    typing.current?.stop();
    typing.current = null;
    if (!next || next.url !== address || !motionSafe) {
      hidden.set(0);
      return;
    }
    const left = Math.max(0, address.length - next.from);
    hidden.set(left);
    typing.current = animate(hidden, 0, {
      duration: left * TYPE_S,
      ease: "linear",
      onComplete: () => {
        if (typeNext.current === next) typeNext.current = null;
      },
    });
  };

  React.useEffect(() => {
    api.current = { sync, typeAddress };
  });

  // Every new address the host gives (or agrees to) is shown; equal on
  // mount, so StrictMode's second run does nothing.
  React.useEffect(() => {
    api.current?.sync(location);
  }, [location]);

  // The address types itself in when a navigation asked for it; a re-run
  // that interrupted the typing starts it again rather than freezing it.
  const tabId = active?.id;
  React.useEffect(() => {
    api.current?.typeAddress();
    return () => {
      typing.current?.stop();
      typing.current = null;
    };
  }, [address, tabId]);

  // Tabs glide to their new width as the count changes.
  const n = state.tabs.length;
  React.useEffect(() => {
    counting.current?.stop();
    if (!motionSafe) {
      count.set(n);
      return;
    }
    counting.current = animate(count, n, springs.glide);
    return () => counting.current?.stop();
  }, [n, motionSafe, count]);

  // Focus follows a tab that was opened or handed over, once it exists.
  const tabIds = state.tabs.map((t) => t.id).join(",");
  React.useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    const node = tabNodes.current.get(id);
    if (!node) return;
    focusNext.current = null;
    // Only focus that was already in the browser follows (or focus a closed
    // tab dropped on the page body); a pointer elsewhere keeps its own.
    const at = document.activeElement;
    if (!at || at === document.body || rootRef.current?.contains(at)) {
      node.focus();
    }
  }, [tabIds, state.active]);

  React.useEffect(() => {
    const running = timers.current;
    return () => {
      for (const t of running.values()) window.clearTimeout(t);
      running.clear();
      typing.current?.stop();
    };
  }, []);

  /* ---------------------------- derived values --------------------------- */

  const tabWidth = useTransform(
    count,
    (c) => `min(${r2(100 / Math.max(1, c))}%, ${TAB_MAX}px)`,
  );
  const hostLen = hostOf(address).length;
  const hostText = useTransform(hidden, (h) =>
    address.slice(0, Math.min(hostLen, address.length - Math.ceil(h))),
  );
  const pathText = useTransform(hidden, (h) => {
    const end = address.length - Math.ceil(h);
    return end > hostLen ? address.slice(hostLen, end) : "";
  });
  const caret = useTransform(hidden, (h) => (h > 0.01 ? 1 : 0));

  const editing = draft !== null;
  const layers = [...state.tabs].sort(
    (a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)),
  );

  const toolButton = cn(
    "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
    "enabled:not-aria-disabled:hover:bg-[var(--tab-browser-hover)] enabled:not-aria-disabled:hover:text-foreground disabled:opacity-40 aria-disabled:opacity-40",
    FOCUS_RING_IN,
  );

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        // Alt with an arrow goes back and forward, as in a browser — but
        // not inside the address bar, where it moves by words.
        if (!event.altKey || event.target === inputRef.current) return;
        if (event.key === "ArrowLeft" && canBack) {
          event.preventDefault();
          goBack(null);
        } else if (event.key === "ArrowRight" && canForward) {
          event.preventDefault();
          goForward(null);
        }
      }}
      className={cn(
        "@container w-full",
        skin === "light" && "light",
        skin === "dark" && "dark",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        className={cn(
          "relative isolate aspect-[8/5] w-full overflow-clip rounded-3 border border-hairline-strong bg-background text-foreground shadow-[0_8px_24px_color-mix(in_oklab,black_14%,transparent)] @min-[480px]:aspect-[12/5]",
          glass
            ? "[--tab-browser-bar:color-mix(in_oklab,var(--card)_72%,transparent)] [--tab-browser-hover:color-mix(in_oklab,var(--foreground)_7%,transparent)]"
            : "[--tab-browser-bar:var(--card)] [--tab-browser-hover:color-mix(in_oklab,var(--foreground)_6%,transparent)]",
        )}
      >
        {/* The pages: under the chrome when it is glass, below it otherwise. */}
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={active ? tabDomId(active.id) : undefined}
          inert={disabled}
          onClick={onPageClick}
          onAuxClick={onPageAuxClick}
          className="absolute inset-x-0 bottom-0"
          style={{ top: glass ? 0 : CHROME }}
        >
          {layers.map((t) => {
            const on = t.id === state.active;
            const page = pageOf(t.shown);
            return (
              <motion.div
                key={t.id}
                aria-hidden={!on || undefined}
                inert={!on}
                className="absolute inset-0"
                initial={false}
                animate={
                  on
                    ? { opacity: 1, visibility: "visible" }
                    : { opacity: 0, transitionEnd: { visibility: "hidden" } }
                }
                transition={{ duration: durations.fast, ease: easings.enter }}
              >
                <AnimatePresence initial={false}>
                  <motion.div
                    key={t.nav}
                    className="absolute inset-0 [scrollbar-width:thin] overflow-y-auto overscroll-contain bg-background"
                    initial={{
                      opacity: 0,
                      y: motionSafe ? distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }}
                    transition={{
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                      y: motionSafe ? springs.glide : { duration: 0 },
                    }}
                  >
                    <div style={{ paddingTop: glass ? CHROME : 0 }}>
                      {page.content}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* The chrome: tabs, then the toolbar. */}
        <div
          className={cn(
            "absolute inset-x-0 top-0 z-10 flex flex-col",
            glass
              ? "border-b border-hairline bg-[color-mix(in_oklab,var(--background)_55%,transparent)] backdrop-blur-md backdrop-saturate-150"
              : "bg-surface-2",
          )}
          style={{ height: CHROME }}
        >
          <div className="flex items-end gap-1 px-2" style={{ height: STRIP }}>
            <span
              aria-hidden
              className="mb-2.5 hidden shrink-0 items-center gap-1 pr-1 @min-[480px]:flex"
            >
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-2 rounded-full bg-ink-3/30" />
              ))}
            </span>
            <div
              role="tablist"
              aria-label="Tabs"
              className="relative h-7 min-w-0 flex-1"
            >
              {state.tabs.map((t, i) => {
                const slot = dragOrder ? dragOrder.indexOf(t.id) : i;
                const url = t.entries[t.index] ?? "";
                const page = pageOf(url);
                return (
                  <TabItem
                    key={t.id}
                    tab={t}
                    title={page.title}
                    icon={page.icon}
                    slot={slot === -1 ? i : slot}
                    count={state.tabs.length}
                    width={tabWidth}
                    active={t.id === state.active}
                    domId={tabDomId(t.id)}
                    panelId={panelId}
                    motionSafe={motionSafe}
                    disabled={disabled}
                    closable={state.tabs.length > 1}
                    bind={(node) => {
                      if (node) tabNodes.current.set(t.id, node);
                      else tabNodes.current.delete(t.id);
                    }}
                    onPress={(event) => {
                      click(1.2, 0.45, event.currentTarget as Element);
                      switchTo(t.id);
                    }}
                    onReorder={(to, from) => {
                      click(
                        to > from ? 1.1 : 0.9,
                        0.35,
                        tabNodes.current.get(t.id),
                      );
                      preview(t.id, to);
                    }}
                    onDragEnd={() => commitOrder(t.id)}
                    onClose={() => closeTab(t.id)}
                    onKeyDown={(event) => onTabKeyDown(event, t.id)}
                  />
                );
              })}
            </div>
            <button
              type="button"
              aria-label="New tab"
              disabled={disabled || state.tabs.length >= MAX_TABS}
              onClick={(event) => {
                click(1.25, 0.45, event.currentTarget);
                if (home) newTab(home.url, false);
              }}
              className={cn(toolButton, "mb-0.5 size-6")}
            >
              <Glyph d={ICONS.plus} className="size-3.5" />
            </button>
          </div>

          <div className="flex flex-1 items-center gap-1 bg-[var(--tab-browser-bar)] px-2 text-foreground">
            <button
              type="button"
              aria-label="Back"
              // Unavailable, not disabled: a button that disables itself
              // as it is used would drop the keyboard's focus.
              aria-disabled={!canBack || undefined}
              disabled={disabled}
              onClick={(event) => goBack(event.currentTarget)}
              className={toolButton}
            >
              <Glyph d={ICONS.back} />
            </button>
            <button
              type="button"
              aria-label="Forward"
              aria-disabled={!canForward || undefined}
              disabled={disabled}
              onClick={(event) => goForward(event.currentTarget)}
              className={toolButton}
            >
              <Glyph d={ICONS.forward} />
            </button>
            <button
              type="button"
              aria-label="Reload"
              aria-disabled={!active || active.loading || undefined}
              disabled={disabled}
              onClick={(event) => {
                if (!active || active.loading) return;
                click(1, 0.45, event.currentTarget);
                ask({
                  kind: "reload",
                  tabId: active.id,
                  url: address,
                  typed: false,
                });
              }}
              className={toolButton}
            >
              <Glyph d={ICONS.reload} />
            </button>
            <form
              className="relative h-7 min-w-0 flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                const text = draft ?? address;
                click(1.1, 0.5, inputRef.current);
                setDraft(null);
                inputRef.current?.blur();
                navigate(text, false);
              }}
            >
              <input
                ref={inputRef}
                type="text"
                aria-label="Address"
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                disabled={disabled}
                value={draft ?? address}
                onFocus={(event) => {
                  setDraft(address);
                  event.currentTarget.select();
                }}
                onBlur={() => setDraft(null)}
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  // Escape puts the address back; with nothing to put
                  // back it is not ours, and the page may use it.
                  if (draft !== null && draft !== address) {
                    event.preventDefault();
                    setDraft(address);
                    requestAnimationFrame(() => inputRef.current?.select());
                  }
                }}
                className={cn(
                  "h-full w-full rounded-full bg-[var(--tab-browser-hover)] pr-3 pl-7 font-mono text-[11px] text-foreground",
                  FOCUS_RING_IN,
                  !editing && "text-transparent caret-transparent",
                )}
              />
              <Glyph
                d={ICONS.lock}
                className="pointer-events-none absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-ink-3"
              />
              {editing ? null : (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-3 left-7 flex items-center overflow-clip font-mono text-[11px] whitespace-pre"
                >
                  <span className="min-w-0 truncate">
                    <motion.span className="text-foreground">
                      {hostText}
                    </motion.span>
                    <motion.span className="text-ink-3">{pathText}</motion.span>
                  </span>
                  <motion.span
                    className="ml-px h-3.5 w-px shrink-0 bg-cobalt-bright"
                    style={{ opacity: caret }}
                  />
                </span>
              )}
            </form>
          </div>
          <AnimatePresence>
            {active?.loading ? (
              <motion.div
                key={`${active.id}-${active.entries.length}-${active.index}-${active.nav}`}
                aria-hidden
                className="absolute inset-x-0 -bottom-px h-0.5 origin-left bg-cobalt-bright"
                initial={{ scaleX: 0.04, opacity: 1 }}
                animate={{ scaleX: 0.85, opacity: 1 }}
                exit={{
                  scaleX: 1,
                  opacity: 0,
                  transition: {
                    scaleX: { duration: durations.fast, ease: easings.enter },
                    opacity: {
                      duration: durations.base,
                      delay: durations.fast,
                    },
                  },
                }}
                transition={{
                  duration: loadTime(address) / 1000,
                  ease: easings.enter,
                }}
              />
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
