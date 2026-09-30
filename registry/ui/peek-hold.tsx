"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PeekHoldItem = {
  id: string;
  /** The row's first line. Also names the preview. */
  title: string;
  /** A second, quieter line. */
  subtitle?: string;
  /** A short note at the row's end: a time, a size. */
  meta?: string;
  /** Before the text: a dot, an avatar. 16px or smaller. */
  leading?: React.ReactNode;
  /** Beside the meta: a flag, a count. */
  badge?: React.ReactNode;
  /** What the peek shows under the row's own header. */
  preview: React.ReactNode;
};

export type PeekHoldAction = {
  id: string;
  /** One or two words: the action's accessible name. */
  label: string;
  /** 16px, drawn in currentColor. */
  icon?: React.ReactNode;
  /** A destructive action is drawn in the danger colour. @default "default" */
  tone?: "default" | "danger";
};

export type PeekHoldLayout = "list" | "row";

export type PeekHoldProps = {
  items: PeekHoldItem[];
  /** The actions offered under a preview, or a function of the item that picks them. */
  menu: PeekHoldAction[] | ((item: PeekHoldItem) => PeekHoldAction[]);
  /** A plain tap or click on a row, or Enter on it. */
  onOpen?: (itemId: string) => void;
  /** An action chosen from a preview. Fires before the preview closes. */
  onAction?: (actionId: string, itemId: string) => void;
  /** A preview opened (with its item's id) or closed (null). */
  onPeekChange?: (itemId: string | null) => void;
  /** The list's accessible name. */
  label: string;
  /** How long a press charges before the row lifts, in ms. @default 450 */
  delay?: number;
  /** How far the row rises as it comes free, in px; its scale and shadow follow. @default 12 */
  lift?: number;
  /** How hard the list behind a preview blurs, in px. @default 6 */
  blur?: number;
  /** The actions as a vertical menu, or as one row of buttons. @default "list" */
  actions?: PeekHoldLayout;
  /** Play the lift, the ticks and the choice. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Via = "hold" | "click" | "keyboard";

type Peek = {
  id: string;
  /** New on every opening, so a reopened row measures again. */
  key: number;
  via: Via;
  closing: boolean;
  /** The card's box when it sits exactly on its row. */
  left: number;
  width: number;
};

type Hold = {
  id: string;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Where the pointer was when the row lifted. */
  liftX: number;
  liftY: number;
  lifted: boolean;
  /** Moved away from where it lifted: letting go on nothing cancels. */
  slid: boolean;
  timer: number;
};

type Latest = {
  peek: Peek | null;
  open: (id: string, via: Via) => void;
  close: (reason: "cancel" | "commit", focusRow?: boolean) => void;
  choose: (index: number) => void;
  highlight: (index: number, focus: boolean) => void;
  actionAt: (x: number, y: number) => number;
  endHold: () => void;
};

/** Pixels a press may wander before it counts as a scroll, not a hold. */
const SLOP_MOUSE = 4;
const SLOP_TOUCH = 9;
const GAP = 8;
const PAD = 6;

const r2 = (v: number) => Math.round(v * 100) / 100;

function Face({ item, titleId }: { item: PeekHoldItem; titleId?: string }) {
  return (
    <span className="flex h-14 items-center gap-3 px-3">
      {item.leading !== undefined ? (
        <span className="flex size-4 shrink-0 items-center justify-center">
          {item.leading}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-left">
        <span
          id={titleId}
          className="block truncate text-sm font-medium text-foreground"
        >
          {item.title}
        </span>
        {item.subtitle ? (
          <span className="block truncate text-xs text-ink-3">
            {item.subtitle}
          </span>
        ) : null}
      </span>
      {item.meta || item.badge ? (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-3">
          {item.badge}
          {item.meta}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A list whose rows you can look into before you open them. A tap opens a
 * row. A long press charges — the row sinks a hair under the finger while
 * the rest of the list starts to blur — and after `delay` the row lifts out
 * of the page: it rises by `lift` on the snap spring and grows downward into
 * a floating preview on the glide spring, with its actions beside it.
 *
 * Without letting go, sliding onto an action highlights it and releasing
 * chooses it; releasing on nothing after sliding away cancels, and the card
 * glides back down into its row. Letting go without moving leaves the
 * preview open, like a right-click — which opens the same thing at once, as
 * do the menu key and Shift+F10, with focus on the first action.
 *
 * The actions are a real `role="menu"`: arrow keys move, Enter chooses,
 * Escape and Tab close and hand focus back to the row. A hold never selects
 * text or opens the browser's own menu, and the list still scrolls the page
 * until a preview is open. Under reduced motion nothing rises, grows or
 * slides: the preview fades in where it will sit, and the blur still marks
 * the state.
 */
export function PeekHold({
  items,
  menu,
  onOpen,
  onAction,
  onPeekChange,
  label,
  delay = 450,
  lift = 12,
  blur = 6,
  actions = "list",
  sound = false,
  disabled = false,
  className,
}: PeekHoldProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const menuId = `${uid}-menu`;
  const titleId = `${uid}-title`;
  const bodyId = `${uid}-body`;
  const wait = Math.max(0, delay);
  const rise = Math.max(0, lift);

  const [charging, setCharging] = React.useState<string | null>(null);
  const [peek, setPeek] = React.useState<Peek | null>(null);
  const [active, setActive] = React.useState(-1);

  const charge = useMotionValue(0);
  const veil = useMotionValue(0);
  const cardY = useMotionValue(0);
  const cardH = useMotionValue(56);
  const cardScale = useMotionValue(1);
  const cardOpacity = useMotionValue(0);
  const elevation = useMotionValue(0);
  const fade = useMotionValue(0);
  const menuY = useMotionValue(0);
  const menuOpacity = useMotionValue(0);
  const pillX = useMotionValue(0);
  const pillY = useMotionValue(0);
  const pillW = useMotionValue(0);
  const pillH = useMotionValue(0);
  const pillOpacity = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const rows = React.useRef(new Map<string, HTMLButtonElement>());
  const actionNodes = React.useRef(new Map<string, HTMLDivElement>());
  const hold = React.useRef<Hold | null>(null);
  const detach = React.useRef<(() => void) | null>(null);
  const suppressClick = React.useRef(false);
  const shown = React.useRef(-1);
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const counter = React.useRef(0);
  const latest = React.useRef<Latest | null>(null);

  const item = peek ? items.find((i) => i.id === peek.id) : undefined;
  const offered = item ? (typeof menu === "function" ? menu(item) : menu) : [];
  const live = peek !== null && !peek.closing;

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };

  const rowRef = (id: string) => (node: HTMLButtonElement | null) => {
    if (node) rows.current.set(id, node);
    else rows.current.delete(id);
  };
  const actionRef = (id: string) => (node: HTMLDivElement | null) => {
    if (node) actionNodes.current.set(id, node);
    else actionNodes.current.delete(id);
  };

  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /** A row's box inside the list, grown by the card's 1px border. */
  const boxOf = (id: string) => {
    const root = rootRef.current;
    const row = rows.current.get(id);
    if (!root || !row) return null;
    const a = root.getBoundingClientRect();
    const b = row.getBoundingClientRect();
    return {
      top: r2(b.top - a.top - 1),
      left: r2(b.left - a.left - 1),
      width: r2(b.width + 2),
      height: r2(b.height + 2),
    };
  };

  const fadeVeil = () =>
    run(
      "veil",
      animate(veil, 0, { duration: durations.base, ease: easings.exit }),
    );

  /** Ends a press that has not lifted: the charge drains away. */
  const endHold = () => {
    const h = hold.current;
    hold.current = null;
    detach.current?.();
    detach.current = null;
    if (!h) return;
    window.clearTimeout(h.timer);
    if (h.lifted) return;
    setCharging(null);
    run(
      "charge",
      animate(charge, 0, { duration: durations.fast, ease: easings.exit }),
    );
    if (!latest.current?.peek || latest.current.peek.closing) fadeVeil();
  };

  const open = (id: string, via: Via) => {
    if (disabled) return;
    const box = boxOf(id);
    if (!box) return;
    const h = hold.current;
    if (h) window.clearTimeout(h.timer);
    setCharging(null);
    run("charge", animate(charge, 0, { duration: durations.fast }));
    counter.current += 1;
    cardY.jump(box.top);
    cardH.jump(box.height);
    cardScale.jump(1);
    cardOpacity.set(motionSafe ? 1 : 0);
    elevation.jump(0);
    menuOpacity.set(0);
    pillOpacity.set(0);
    shown.current = via === "keyboard" ? 0 : -1;
    setActive(shown.current);
    setPeek({
      id,
      key: counter.current,
      via,
      closing: false,
      left: box.left,
      width: box.width,
    });
    audio.play("whoosh", {
      pitch: r2(1.35 - rise * 0.01),
      gain: r2(0.28 + rise * 0.006),
      pan: panOf(rows.current.get(id)),
    });
    onPeekChange?.(id);
  };

  const close = (reason: "cancel" | "commit", focusRow = true) => {
    const p = latest.current?.peek ?? peek;
    if (!p || p.closing) return;
    const row = rows.current.get(p.id);
    const hadFocus = rootRef.current?.contains(document.activeElement);
    shown.current = -1;
    setPeek({ ...p, closing: true });
    setActive(-1);
    if (reason === "cancel") {
      audio.play("whoosh", { pitch: 0.8, gain: 0.18, pan: panOf(row) });
    }
    const done = () =>
      setPeek((now) => (now && now.key === p.key ? null : now));
    fadeVeil();
    run(
      "menu",
      animate(menuOpacity, 0, { duration: durations.fast, ease: easings.exit }),
    );
    const box = boxOf(p.id);
    if (motionSafe && box) {
      // The card glides back onto its row and is swapped for it where the
      // two are identical, so the hand-off has no seam.
      run("cardY", animate(cardY, box.top, springs.glide));
      run("cardScale", animate(cardScale, 1, springs.glide));
      run("elevation", animate(elevation, 0, springs.glide));
      run("fade", animate(fade, 0, { duration: durations.fast }));
      run(
        "cardH",
        animate(cardH, box.height, { ...springs.glide, onComplete: done }),
      );
    } else {
      run(
        "card",
        animate(cardOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: done,
        }),
      );
    }
    if (focusRow && hadFocus) row?.focus({ preventScroll: true });
    onPeekChange?.(null);
  };

  const choose = (index: number) => {
    const p = latest.current?.peek ?? peek;
    const action = offered[index];
    if (!p || p.closing || !action) return;
    audio.play("pop", {
      pitch: 1,
      gain: 0.6,
      pan: panOf(actionNodes.current.get(action.id)),
    });
    onAction?.(action.id, p.id);
    close("commit");
  };

  const highlight = (index: number, focus: boolean) => {
    if (index === shown.current) return;
    shown.current = index;
    setActive(index);
    const action = offered[index];
    const node = action ? actionNodes.current.get(action.id) : undefined;
    if (!node) return;
    audio.play("tick", {
      pitch: r2(1.25 - (0.3 * index) / Math.max(1, offered.length - 1)),
      gain: 0.4,
      pan: panOf(node),
    });
    if (focus) node.focus({ preventScroll: true });
  };

  // Found by their boxes: during a touch hold every move is delivered to the
  // row the finger went down on, not to what is under it.
  const actionAt = (x: number, y: number) =>
    offered.findIndex((a) => {
      const r = actionNodes.current.get(a.id)?.getBoundingClientRect();
      return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });

  const onRowPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (disabled || live) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    suppressClick.current = false;
    endHold();
    const pointerId = event.pointerId;
    hold.current = {
      id,
      pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      liftX: event.clientX,
      liftY: event.clientY,
      lifted: false,
      slid: false,
      timer: window.setTimeout(() => {
        const h = hold.current;
        if (!h || h.pointerId !== pointerId) return;
        h.lifted = true;
        h.liftX = h.x;
        h.liftY = h.y;
        // The release that follows is not a tap on the row.
        suppressClick.current = true;
        latest.current?.open(id, "hold");
      }, wait),
    };
    setCharging(id);
    run(
      "charge",
      animate(charge, 1, { duration: wait / 1000, ease: "linear" }),
    );
    run("veil", animate(veil, 0.45, { duration: wait / 1000, ease: "linear" }));

    const move = (e: PointerEvent) => {
      const h = hold.current;
      if (!h || e.pointerId !== pointerId) return;
      h.x = e.clientX;
      h.y = e.clientY;
      if (!h.lifted) {
        const slop = h.pointerType === "mouse" ? SLOP_MOUSE : SLOP_TOUCH;
        if (Math.hypot(h.x - h.startX, h.y - h.startY) > slop) {
          latest.current?.endHold();
        }
        return;
      }
      if (Math.hypot(h.x - h.liftX, h.y - h.liftY) > 10) h.slid = true;
      const now = latest.current;
      if (!now) return;
      const i = now.actionAt(h.x, h.y);
      if (i !== -1 || h.slid) now.highlight(i, true);
    };
    const up = (e: PointerEvent) => {
      const h = hold.current;
      if (!h || e.pointerId !== pointerId) return;
      const now = latest.current;
      now?.endHold();
      if (!h.lifted || !now) return;
      const i = now.actionAt(e.clientX, e.clientY);
      if (i !== -1) now.choose(i);
      else if (h.slid) now.close("cancel");
      // Let go where it lifted: the preview stays, as after a right-click.
    };
    const cancel = (e: PointerEvent) => {
      const h = hold.current;
      if (!h || e.pointerId !== pointerId) return;
      latest.current?.endHold();
      if (h.lifted) latest.current?.close("cancel");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    detach.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const n = offered.length;
    if (n === 0) return;
    const across = actions === "row";
    const step = (d: number) => {
      const from = shown.current === -1 ? (d > 0 ? -1 : 0) : shown.current;
      highlight((from + d + n) % n, true);
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        step(-1);
        return;
      case "ArrowRight":
      case "ArrowLeft":
        if (!across) return;
        event.preventDefault();
        step(event.key === "ArrowRight" ? 1 : -1);
        return;
      case "Home":
        event.preventDefault();
        highlight(0, true);
        return;
      case "End":
        event.preventDefault();
        highlight(n - 1, true);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (shown.current !== -1) choose(shown.current);
        return;
      case "Escape":
      case "Tab":
        // Handled here, where focus is; the stage must not also see Escape.
        event.preventDefault();
        close("cancel");
        return;
    }
  };

  React.useEffect(() => {
    latest.current = {
      peek,
      open,
      close,
      choose,
      highlight,
      actionAt,
      endHold,
    };
  });

  // The preview arrives on its row's own box; measured now, it grows into
  // its place, which keeps the card and its actions inside the list.
  const peekKey = peek?.key;
  const peekClosing = peek?.closing ?? true;
  React.useLayoutEffect(() => {
    const p = peek;
    const root = rootRef.current;
    const card = cardRef.current;
    const list = menuRef.current;
    if (!p || p.closing || !root || !card || !list) return;
    const box = boxOf(p.id);
    if (!box) return;
    const boxH = root.clientHeight;
    const menuH = list.offsetHeight;
    const natural = card.offsetHeight + 2;
    const room = Math.max(box.height, boxH - 2 * PAD - GAP - menuH);
    const height = r2(Math.min(natural, room));
    const top = r2(
      Math.max(
        PAD,
        Math.min(box.top - rise, boxH - PAD - height - GAP - menuH),
      ),
    );
    fade.set(natural > room + 0.5 ? 1 : 0);
    const menuTop = r2(top + height + GAP);
    if (!motionSafe) {
      cardY.jump(top);
      cardH.jump(height);
      menuY.jump(menuTop);
      elevation.jump(1);
      run(
        "card",
        animate(cardOpacity, 1, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
    } else {
      menuY.jump(r2(menuTop - distances.nudge));
      run("cardY", animate(cardY, top, springs.snap));
      run("cardScale", animate(cardScale, r2(1 + rise * 0.0012), springs.snap));
      run("elevation", animate(elevation, 1, springs.snap));
      run("cardH", animate(cardH, height, springs.glide));
      run("menuY", animate(menuY, menuTop, { ...springs.snap, delay: 0.06 }));
    }
    run(
      "menu",
      animate(menuOpacity, 1, {
        duration: durations.base,
        delay: motionSafe ? 0.06 : 0,
        ease: easings.enter,
      }),
    );
    run(
      "veil",
      animate(veil, 1, { duration: durations.base, ease: easings.enter }),
    );
    // Focus goes into the menu: onto its first action when the keyboard
    // asked, onto the menu itself for a pointer, which has not chosen yet.
    const first = list.querySelector<HTMLElement>("[role='menuitem']");
    if (p.via === "keyboard" && first) first.focus({ preventScroll: true });
    else list.focus({ preventScroll: true });
    // Measured once per opening, not on every render of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekKey, peekClosing]);

  // The highlight is a pill that moves between actions on the snap spring.
  React.useLayoutEffect(() => {
    const action = offered[active];
    const node = action ? actionNodes.current.get(action.id) : undefined;
    if (!node) {
      run(
        "pill",
        animate(pillOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
        }),
      );
      return;
    }
    const x = node.offsetLeft;
    const y = node.offsetTop;
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    if (!motionSafe || pillOpacity.get() < 0.05) {
      pillX.jump(x);
      pillY.jump(y);
      pillW.jump(w);
      pillH.jump(h);
    } else {
      run("pillX", animate(pillX, x, springs.snap));
      run("pillY", animate(pillY, y, springs.snap));
      run("pillW", animate(pillW, w, springs.snap));
      run("pillH", animate(pillH, h, springs.snap));
    }
    run(
      "pill",
      animate(pillOpacity, 1, {
        duration: durations.blink,
        ease: easings.enter,
      }),
    );
    // The pill follows the highlighted action only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, peekKey]);

  // Holding a preview open on a touch screen, the finger slides to an action
  // instead of scrolling the page. Before the lift, moves still scroll, and
  // a scroll cancels the charge.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onTouchMove = (event: TouchEvent) => {
      if (hold.current?.lifted && event.cancelable) event.preventDefault();
    };
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => root.removeEventListener("touchmove", onTouchMove);
  }, []);

  // Anything that takes the page away ends a hold and closes a preview; so
  // does a press anywhere outside the list.
  React.useEffect(() => {
    const interrupted = () => {
      latest.current?.endHold();
      latest.current?.close("cancel", false);
    };
    const onVisibility = () => {
      if (document.hidden) interrupted();
    };
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !latest.current?.peek) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      latest.current.close("cancel", false);
    };
    window.addEventListener("blur", interrupted);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("blur", interrupted);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  // A row that leaves the list while it is previewed takes its preview along;
  // a list that is disabled drops whatever it was doing.
  const gone = live && !item;
  React.useEffect(() => {
    if (gone || disabled) {
      latest.current?.endHold();
      latest.current?.close("cancel", false);
    }
  }, [gone, disabled]);

  React.useEffect(() => {
    const anims = running.current;
    return () => {
      detach.current?.();
      detach.current = null;
      if (hold.current) window.clearTimeout(hold.current.timer);
      hold.current = null;
      for (const c of anims.values()) c.stop();
      anims.clear();
    };
  }, []);

  const rowScale = useTransform(charge, (c) => r2(1 - 0.015 * c));
  const shadowTint = Math.round(10 + rise * 0.8);
  const shadow = useTransform(elevation, (e) => {
    const k = Math.max(0, e);
    return k < 0.01
      ? "none"
      : `0 ${r2(rise * 0.5 * k)}px ${r2(rise * 1.6 * k)}px color-mix(in oklch, black ${shadowTint}%, transparent)`;
  });
  const backdrop = blur > 0 ? `blur(${Math.round(blur)}px)` : "none";

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative isolate w-full select-none [-webkit-touch-callout:none]",
        disabled && "opacity-50",
        className,
      )}
      onContextMenu={(event) => {
        // The browser's own menu never opens here. A right-click opens the
        // preview; a long-press a touch browser reports as one is the hold's.
        event.preventDefault();
        if (disabled || live) return;
        if (hold.current && hold.current.pointerType !== "mouse") return;
        const target = event.target instanceof Element ? event.target : null;
        const id = target
          ?.closest("[data-peek-row]")
          ?.getAttribute("data-peek-row");
        if (!id) return;
        endHold();
        open(id, "click");
      }}
    >
      <span id={hintId} className="sr-only">
        Press and hold, or press Shift+F10, for a preview and actions.
      </span>
      <ul
        role="list"
        aria-label={label}
        className="flex flex-col rounded-3 border border-hairline bg-card p-1.5"
      >
        {items.map((it) => {
          const isOpen = live && peek.id === it.id;
          const isCharging = charging === it.id;
          // Hidden under its card; under reduced motion the card fades out
          // over the row instead of landing on it.
          const hidden = peek?.id === it.id && !(peek.closing && !motionSafe);
          return (
            <li key={it.id} className={cn("relative", isCharging && "z-20")}>
              <button
                ref={rowRef(it.id)}
                type="button"
                data-peek-row={it.id}
                disabled={disabled}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={isOpen ? menuId : undefined}
                aria-describedby={hintId}
                onPointerDown={(event) => onRowPointerDown(event, it.id)}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  if (!live) onOpen?.(it.id);
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "ContextMenu" ||
                    (event.shiftKey && event.key === "F10")
                  ) {
                    event.preventDefault();
                    open(it.id, "keyboard");
                  }
                }}
                className={cn(
                  "block w-full touch-pan-y rounded-2 outline-none",
                  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
                  "enabled:cursor-pointer disabled:cursor-not-allowed",
                )}
              >
                <motion.span
                  className={cn(
                    "block rounded-2 transition-colors",
                    !disabled && !peek && "hover:bg-surface-2",
                    isCharging && "bg-surface-2",
                    hidden && "opacity-0",
                  )}
                  style={
                    isCharging && motionSafe ? { scale: rowScale } : undefined
                  }
                >
                  <Face item={it} />
                </motion.span>
              </button>
            </li>
          );
        })}
      </ul>

      <motion.div
        aria-hidden
        onPointerDown={() => {
          if (live) close("cancel");
        }}
        className={cn(
          "absolute inset-0 z-10 rounded-3 bg-background/30",
          live ? "pointer-events-auto" : "pointer-events-none",
        )}
        style={{
          opacity: veil,
          backdropFilter: backdrop,
          WebkitBackdropFilter: backdrop,
        }}
      />

      {peek && item ? (
        <>
          {/* The card repeats its row, so assistive technology meets it
              only through the menu it names and describes. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute top-0 z-20 overflow-clip rounded-3 border border-hairline-strong bg-popover"
            style={{
              left: peek.left,
              width: peek.width,
              y: cardY,
              height: cardH,
              scale: cardScale,
              opacity: cardOpacity,
              boxShadow: shadow,
            }}
          >
            <div ref={cardRef}>
              <Face item={item} titleId={titleId} />
              <div
                id={bodyId}
                className="px-3 pb-3 text-xs leading-5 text-ink-2"
              >
                {item.preview}
              </div>
            </div>
            <motion.span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-popover to-transparent"
              style={{ opacity: fade }}
            />
          </motion.div>

          <motion.div
            ref={menuRef}
            id={menuId}
            role="menu"
            tabIndex={-1}
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            aria-orientation={actions === "row" ? "horizontal" : "vertical"}
            onKeyDown={onMenuKeyDown}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse" && !hold.current) {
                shown.current = -1;
                setActive(-1);
              }
            }}
            className={cn(
              "absolute top-0 z-20 rounded-3 border border-hairline-strong bg-popover p-1 outline-none",
              actions === "row"
                ? "grid auto-cols-fr grid-flow-col gap-1"
                : "flex flex-col",
              !live && "pointer-events-none",
            )}
            style={{
              left: peek.left,
              width: peek.width,
              y: menuY,
              opacity: menuOpacity,
              boxShadow: shadow,
            }}
          >
            <motion.span
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-0 left-0 rounded-2",
                offered[active]?.tone === "danger"
                  ? "bg-danger/12"
                  : "bg-cobalt-wash",
              )}
              style={{
                x: pillX,
                y: pillY,
                width: pillW,
                height: pillH,
                opacity: pillOpacity,
              }}
            />
            {offered.map((action, i) => (
              <motion.div
                key={action.id}
                ref={actionRef(action.id)}
                role="menuitem"
                tabIndex={active === i ? 0 : -1}
                onPointerMove={(event) => {
                  if (event.pointerType === "mouse" && !hold.current) {
                    highlight(i, false);
                  }
                }}
                onClick={() => choose(i)}
                initial={
                  motionSafe
                    ? { opacity: 0, y: -distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  motionSafe
                    ? {
                        ...springs.snap,
                        delay: 0.06 + i * cascade(offered.length),
                      }
                    : { duration: durations.fast }
                }
                className={cn(
                  "relative flex cursor-pointer rounded-2 outline-none",
                  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  action.tone === "danger" ? "text-danger" : "text-foreground",
                  actions === "row"
                    ? "h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px]"
                    : "h-8 items-center gap-2.5 px-2.5 text-sm",
                )}
              >
                {action.icon ? (
                  <span
                    aria-hidden
                    className="flex size-4 shrink-0 items-center justify-center"
                  >
                    {action.icon}
                  </span>
                ) : null}
                <span
                  className={
                    actions === "row"
                      ? "line-clamp-2 max-w-full text-center leading-tight"
                      : "truncate"
                  }
                >
                  {action.label}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </>
      ) : null}
    </div>
  );
}
