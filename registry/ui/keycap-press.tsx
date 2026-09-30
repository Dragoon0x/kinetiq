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
import { durations, easings } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type KeycapSwitch = "clicky" | "tactile" | "linear";
export type KeycapLegend = "both" | "key" | "label";
export type KeycapPressVia = "pointer" | "keyboard" | "shortcut";

export type KeycapPressProps = {
  /** The action, in a word or two. The accessible name, and the label legend. */
  label: string;
  /**
   * The real key that presses it from anywhere on the page: `"e"`,
   * `"shift+r"`, `"mod+enter"`, `"space"`, `"/"`. `mod` is ⌘ on Apple
   * platforms and Ctrl elsewhere.
   */
  shortcut: string;
  /** Fires once per press, with what pressed it. */
  onPress?: (via: KeycapPressVia) => void;
  /** Sets the travel curve and the sound. @default "clicky" */
  switch?: KeycapSwitch;
  /** Skirt height in px, 4 to 14: taller caps travel further and sound deeper. @default 8 */
  height?: number;
  /** What is printed on the cap. @default "both" */
  legend?: KeycapLegend;
  /** A backlight halo under the cap, faint at rest, blooming on actuation. @default true */
  glow?: boolean;
  /** Play the switch. Off unless asked for. @default false */
  sound?: boolean;
  /** Dims the key, blocks presses and stops listening for the shortcut. */
  disabled?: boolean;
  className?: string;
};

type Spring = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
};

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number): Spring => ({
  type: "spring",
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

type SwitchFeel = {
  /** Where the finger meets resistance, as a share of travel. 0: none. */
  bump: number;
  /** Where the switch registers: the legend lights here. */
  actuate: number;
  /** The loaded approach to the bump — decelerating, the finger is resisted. */
  approach: { duration: number; ease: [number, number, number, number] };
  /** From the bump to the floor, and the finger's speed when it starts. */
  fall: Spring;
  push: number;
};

/*
 * Every fall aims at the floor on an underdamped spring and the overshoot is
 * reflected (see `floor`), because a keycap stops on a hard bottom: it can
 * bounce up off it but never sink through it. A critically damped fall would
 * creep the last few percent and the bottom-out would sound late.
 */
const SWITCHES: Record<KeycapSwitch, SwitchFeel> = {
  // The click jacket holds, then gives all at once: a slam and a rattle.
  clicky: {
    bump: 0.46,
    actuate: 0.46,
    approach: { duration: 0.055, ease: [0.2, 0.8, 0.4, 1] },
    fall: spring(3400, 0.5),
    push: 0,
  },
  // A rounded bump: a hitch, then a firm, composed bottom-out.
  tactile: {
    bump: 0.36,
    actuate: 0.36,
    approach: { duration: 0.045, ease: [0.3, 0.7, 0.5, 1] },
    fall: spring(2600, 0.7),
    push: 0,
  },
  // Nothing in the way: one smooth stroke from the finger's own speed.
  linear: {
    bump: 0,
    actuate: 0.5,
    approach: { duration: 0, ease: [0, 0, 1, 1] },
    fall: spring(2600, 0.78),
    push: 10,
  },
};

/** Every switch comes back on the same stem spring. */
const RISE = spring(2000, 0.9);
const BOTTOM = 0.97;
const TOP = 0.03;
/** A clicky jacket resets here on the way up, and clicks again. */
const RESET = 0.34;
/** Under reduced motion, the least time a press stays visibly down, in ms. */
const SEEN = 90;
/** Read only from input handlers and timers, never while rendering. */
const clock = () => performance.now();

const FACE_HEIGHT = 52;
const TAPER = 3;
const WELL_PAD = 7;

// Shading, not theme: a lit face, a front wall in its own shadow and a well
// deeper still read the same way on a light page and a dark one, so the
// surfaces are the theme's own colours darkened, never fixed values.
const FACE = "color-mix(in oklch, var(--bg-1) 92%, var(--ink-3))";
const FACE_FILL = `linear-gradient(to bottom, color-mix(in oklab, ${FACE} 94%, black), ${FACE} 58%)`;
const FACE_EDGE = "inset 0 1px 0 color-mix(in oklab, white 22%, transparent)";
const BODY = `color-mix(in oklab, ${FACE} 78%, black)`;
const WELL = "color-mix(in oklab, var(--bg-0) 90%, black)";
const WELL_SHADE =
  "inset 0 1px 2px color-mix(in oklab, black 24%, transparent)";
const HALO =
  "0 0 0 1px color-mix(in oklch, var(--accent-bright) 50%, transparent), 0 0 7px 1px color-mix(in oklch, var(--accent-bright) 60%, transparent)";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
/** The floor reflects: past 1 the cap is bouncing back up off the bottom. */
const floor = (d: number) => (d > 1 ? Math.max(0, 2 - d) : Math.max(0, d));

type Combo = {
  key: string;
  code: string | null;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  mod: boolean;
  /** Letters, digits and named keys care about Shift; "?" or "+" cannot. */
  strictShift: boolean;
};

const ALIASES: Record<string, string> = {
  space: " ",
  spacebar: " ",
  esc: "escape",
  return: "enter",
  del: "delete",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  plus: "+",
};

function parseShortcut(raw: string): Combo {
  const tokens = raw
    .split("+")
    .map((t) => (t === " " ? t : t.trim().toLowerCase()));
  let key = tokens.pop() ?? "";
  // "ctrl++" and "+" end in empty tokens: the key is the plus itself.
  if (key === "" && tokens.length > 0) {
    tokens.pop();
    key = "+";
  }
  key = ALIASES[key] ?? key;
  const has = (...names: string[]) => tokens.some((t) => names.includes(t));
  const letter = /^[a-z]$/.test(key);
  const digit = /^[0-9]$/.test(key);
  return {
    key,
    code: letter ? `Key${key.toUpperCase()}` : digit ? `Digit${key}` : null,
    ctrl: has("ctrl", "control"),
    alt: has("alt", "option", "opt"),
    shift: has("shift"),
    meta: has("meta", "cmd", "command", "super"),
    mod: has("mod"),
    strictShift: letter || digit || key.length > 1,
  };
}

function matches(combo: Combo, event: KeyboardEvent, apple: boolean) {
  if (combo.key === "") return false;
  const ctrl = combo.ctrl || (combo.mod && !apple);
  const meta = combo.meta || (combo.mod && apple);
  if (event.ctrlKey !== ctrl || event.metaKey !== meta) return false;
  if (event.altKey !== combo.alt) return false;
  if (combo.strictShift && event.shiftKey !== combo.shift) return false;
  const key = event.key.toLowerCase();
  if (key === combo.key) return true;
  // Alt (or a non-Latin layout) turns the character into something else, but
  // the physical key is still the one printed on the cap. Only then is the
  // code trusted: on a Latin layout the character is the truth, wherever the
  // key sits.
  if (/^[a-z0-9]$/.test(key)) return false;
  return combo.code !== null && event.code === combo.code;
}

const GLYPHS: Record<string, string> = {
  " ": "Space",
  enter: "⏎",
  escape: "Esc",
  tab: "Tab",
  backspace: "⌫",
  delete: "Del",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  pageup: "PgUp",
  pagedown: "PgDn",
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function legendOf(combo: Combo, apple: boolean): string {
  const glyph = GLYPHS[combo.key] ?? capital(combo.key);
  const ctrl = combo.ctrl || (combo.mod && !apple);
  const meta = combo.meta || (combo.mod && apple);
  if (apple) {
    return `${ctrl ? "⌃" : ""}${combo.alt ? "⌥" : ""}${combo.shift ? "⇧" : ""}${meta ? "⌘" : ""}${glyph}`;
  }
  const mods = [
    ctrl && "Ctrl",
    combo.alt && "Alt",
    combo.shift && "Shift",
    meta && "Win",
  ].filter(Boolean);
  return [...mods, glyph].join("+");
}

const ARIA_KEYS: Record<string, string> = {
  " ": "Space",
  "+": "Plus",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  pageup: "PageUp",
  pagedown: "PageDown",
};

function ariaOf(combo: Combo, apple: boolean): string {
  const mods = [
    (combo.ctrl || (combo.mod && !apple)) && "Control",
    combo.alt && "Alt",
    combo.shift && "Shift",
    (combo.meta || (combo.mod && apple)) && "Meta",
  ].filter(Boolean);
  const key = ARIA_KEYS[combo.key] ?? capital(combo.key);
  return [...mods, key].join("+");
}

// The platform only decides which modifier `mod` means and how it is drawn.
// The server cannot know it, so it reports "not Apple" and the first client
// render agrees; the real answer arrives one render later, without a mismatch.
const noSubscribe = () => () => {};
const isApple = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

const EDITABLE =
  "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
const INTERACTIVE =
  "button, a[href], summary, [role='button'], [role='link'], [role='menuitem'], [role='option'], [role='tab'], [role='checkbox'], [role='radio'], [role='switch'], [tabindex]:not([tabindex='-1'])";
const MODIFIERS = new Set(["Control", "Alt", "Shift", "Meta"]);

type Stroke = {
  /** What is holding the cap down, if anything. */
  held: KeycapPressVia | null;
  /** Released before it bottomed out: the return starts when it does. */
  pending: boolean;
  actuated: boolean;
  bottomed: boolean;
  reset: boolean;
  pan: number;
  /** When it went down, so a reduced-motion tap is down long enough to see. */
  since: number;
  /** For a shortcut: the physical key whose keyup lets go. */
  code: string;
};

/**
 * A mechanical keycap that is a real button, and whose real key presses it.
 * Clicked, tapped, focused and pressed with Space or Enter, or typed as its
 * `shortcut` anywhere on the page, the cap goes down and stays down for as
 * long as the finger or the key does; it comes back up on release. A quick
 * tap is always a whole stroke: a lift before the floor waits for the floor.
 *
 * The switch sets the stroke. A clicky switch holds at the click jacket on a
 * decelerating tween, then gives and slams to the floor on an underdamped
 * spring that rattles off the bottom; a tactile one hitches at a softer bump
 * and lands composed; a linear one falls in one smooth stroke. Every return
 * is the same stem spring, taking the velocity the cap has when let go.
 * Sounds come from watching the cap itself, on the frame it passes the
 * actuation point, the floor or the reset point: a click on the way down and
 * a softer one on the way up for clicky, a thock for tactile, a muted thud
 * for linear, all pitched lower as the cap gets taller. The legend lights at
 * actuation and fades once released.
 *
 * The shortcut never takes a key the page already handled (`defaultPrevented`)
 * or one typed into a field, and it claims the key when it acts, so a second
 * keycap with the same shortcut does not also fire. A key behind a modal,
 * inside an `inert` region, hidden or disabled does not listen. Under reduced
 * motion the cap swaps straight between up and down with no curve, while the
 * legend, the halo and the sound still answer, because a press is information.
 */
export function KeycapPress({
  label,
  shortcut,
  onPress,
  switch: switchType = "clicky",
  height = 8,
  legend = "both",
  glow = true,
  sound = false,
  disabled = false,
  className,
}: KeycapPressProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const apple = React.useSyncExternalStore(noSubscribe, isApple, () => false);
  const combo = React.useMemo(() => parseShortcut(shortcut), [shortcut]);
  const feel = SWITCHES[switchType] ?? SWITCHES.clicky;
  const skirt = Math.round(Math.min(14, Math.max(4, height)));
  const travel = r2(skirt * 0.7);
  // A taller cap is a deeper cavity: it sounds lower.
  const register = r2(1.12 - ((skirt - 4) / 10) * 0.24);

  const depth = useMotionValue(0);
  const lit = useMotionValue(0);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const keyActivation = React.useRef(false);
  const stroke = React.useRef<Stroke>({
    held: null,
    pending: false,
    actuated: false,
    bottomed: false,
    reset: true,
    pan: 0,
    since: 0,
    code: "",
  });

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const light = () => {
    running.current.push(
      animate(lit, 1, { duration: durations.blink, ease: easings.enter }),
    );
  };

  const press = (via: KeycapPressVia, tap = false) => {
    if (disabled) return;
    halt();
    const s = stroke.current;
    const from = depth.get();
    s.held = via;
    s.pending = tap && motionSafe;
    s.bottomed = false;
    s.reset = false;
    // Pressed again before the jacket reset: it is still actuated, and a
    // real clicky switch would not click twice. The light comes back on.
    if (from < feel.actuate) s.actuated = false;
    else if (s.actuated) light();
    const rect = buttonRef.current?.getBoundingClientRect();
    s.pan = rect ? panFrom(rect.left + rect.width / 2, null) : 0;
    s.since = clock();

    if (!motionSafe) {
      depth.set(1);
      if (tap) {
        timers.current.push(window.setTimeout(() => release(via), SEEN));
      }
      return;
    }
    const fall = () => {
      running.current.push(
        animate(depth, 1, {
          ...feel.fall,
          velocity: from > 0.02 ? depth.getVelocity() : feel.push,
        }),
      );
    };
    if (feel.bump > 0 && from < feel.bump - 0.02) {
      running.current.push(
        animate(depth, feel.bump, { ...feel.approach, onComplete: fall }),
      );
    } else {
      fall();
    }
  };

  const release = (via: KeycapPressVia | null = null) => {
    const s = stroke.current;
    if (!s.held || (via !== null && s.held !== via)) return;
    if (motionSafe && !s.bottomed) {
      s.pending = true;
      return;
    }
    // With no travel to watch, a click's down and up can land in one frame;
    // the pressed state is held until it has been on screen.
    const early = SEEN - (clock() - s.since);
    if (!motionSafe && early > 0) {
      timers.current.push(window.setTimeout(() => release(via), early));
      return;
    }
    s.held = null;
    s.pending = false;
    halt();
    if (motionSafe) {
      running.current.push(
        animate(depth, 0, { ...RISE, velocity: depth.getVelocity() }),
      );
    } else {
      depth.set(0);
    }
    running.current.push(
      animate(lit, 0, { duration: durations.slow, ease: easings.exit }),
    );
  };

  // What the listeners below need, current on every render, without
  // re-binding a document listener each time a prop changes.
  const latest = React.useRef({
    press,
    release,
    onPress,
    combo,
    apple,
    disabled,
    feel,
    switchType,
    register,
    audio,
    motionSafe,
    light,
  });
  React.useEffect(() => {
    latest.current = {
      press,
      release,
      onPress,
      combo,
      apple,
      disabled,
      feel,
      switchType,
      register,
      audio,
      motionSafe,
      light,
    };
  });

  // The sound and the light belong to the cap's own crossings, so they land
  // on the frame the cap reaches each point, whatever drove it there.
  React.useEffect(() => {
    let prev = depth.get();
    const unsubscribe = depth.on("change", (v) => {
      const s = stroke.current;
      const {
        feel: f,
        switchType: kind,
        register: reg,
        audio: out,
      } = latest.current;
      const pan = s.pan;
      if (v > prev) {
        if (!s.actuated && prev < f.actuate && v >= f.actuate) {
          s.actuated = true;
          latest.current.light();
          if (kind === "clicky") {
            out.play("click", { pitch: r2(reg * 1.05), gain: 0.62, pan });
            out.play("snap", { pitch: r2(reg * 1.3), gain: 0.3, pan });
          }
        }
        if (!s.bottomed && v >= BOTTOM) {
          s.bottomed = true;
          if (kind === "tactile") {
            out.play("thock", { pitch: r2(reg * 1.35), gain: 0.62, pan });
          } else if (kind === "linear") {
            out.play("thud", { pitch: r2(reg * 1.9), gain: 0.46, pan });
          }
          // Let go before the floor: the return starts now, once the
          // current frame has finished with this animation.
          if (s.pending && latest.current.motionSafe) {
            queueMicrotask(() => latest.current.release());
          }
        }
      } else if (v < prev) {
        if (s.actuated && !s.reset && prev > RESET && v <= RESET) {
          s.reset = true;
          if (kind === "clicky") {
            out.play("click", { pitch: r2(reg * 1.32), gain: 0.28, pan });
          }
        }
        if (prev > TOP && v <= TOP) {
          s.actuated = false;
          if (kind === "tactile") {
            out.play("clack", { pitch: r2(reg * 1.2), gain: 0.14, pan });
          }
        }
      }
      prev = v;
    });
    return unsubscribe;
  }, [depth]);

  // The real key, anywhere on the page.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const now = latest.current;
      const button = buttonRef.current;
      if (!button || now.disabled) return;
      if (event.defaultPrevented || event.isComposing) return;
      if (!matches(now.combo, event, now.apple)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(EDITABLE)) return;
      const activation = now.combo.key === " " || now.combo.key === "enter";
      // Space and Enter on a focused control are that control's; on this
      // button they are the native press, which handles them itself.
      if (activation && target?.closest(INTERACTIVE)) return;
      if (button.closest("[inert]") || button.getClientRects().length === 0) {
        return;
      }
      const dialog = target?.closest(
        "dialog, [role='dialog'], [role='alertdialog']",
      );
      if (dialog && !dialog.contains(button)) return;
      // Claimed: the browser and any later listener see it as handled.
      event.preventDefault();
      if (event.repeat) return;
      stroke.current.code = event.code;
      now.press("shortcut");
      now.onPress?.("shortcut");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const s = stroke.current;
      if (s.held !== "shortcut") return;
      // macOS sends no keyup for a key released while ⌘ is down, so for a
      // combo, the modifier's own keyup lets go too.
      const combo = latest.current.combo;
      const chord =
        combo.ctrl || combo.alt || combo.shift || combo.meta || combo.mod;
      if (
        event.code === s.code ||
        event.key.toLowerCase() === combo.key ||
        (chord && MODIFIERS.has(event.key))
      ) {
        latest.current.release("shortcut");
      }
    };
    const letGo = () => latest.current.release();
    const onVisibility = () => {
      if (document.hidden) letGo();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", letGo);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", letGo);
    };
  }, []);

  // Disabled mid-press: the cap comes back up rather than sticking down.
  React.useEffect(() => {
    if (disabled) latest.current.release();
  }, [disabled]);

  React.useEffect(() => halt, [halt]);

  const y = useTransform(depth, (d) => r2(floor(d) * travel));
  const legendColor = useTransform(
    lit,
    (l) =>
      `color-mix(in oklch, var(--accent-bright) ${Math.round(clamp01(l) * 100)}%, var(--ink-2))`,
  );
  const haloOpacity = useTransform(lit, (l) => r2(0.16 + 0.84 * clamp01(l)));

  const glyph = legendOf(combo, apple);

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-keyshortcuts={ariaOf(combo, apple)}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        press("pointer");
      }}
      onPointerUp={() => release("pointer")}
      onPointerLeave={() => release("pointer")}
      onPointerCancel={() => release("pointer")}
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        if (event.repeat) {
          // A held Enter would click again on every repeat; one press is one
          // action, as it is for the shortcut.
          if (event.key === "Enter") event.preventDefault();
          return;
        }
        keyActivation.current = true;
        press("keyboard");
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") release("keyboard");
      }}
      onBlur={() => {
        keyActivation.current = false;
        release("keyboard");
      }}
      onClick={(event) => {
        if (event.detail > 0) {
          onPress?.("pointer");
          return;
        }
        // No pointer behind it. Space or Enter already moved the cap; a click
        // from assistive technology gets a whole tap, sound and all.
        if (keyActivation.current) keyActivation.current = false;
        else press("keyboard", true);
        onPress?.("keyboard");
      }}
      className={cn(
        "group relative inline-flex shrink-0 cursor-pointer touch-manipulation rounded-3 outline-none select-none [-webkit-touch-callout:none]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{ padding: WELL_PAD }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-clip rounded-3 border border-hairline-strong transition-colors group-enabled:group-hover:border-ink-3/60"
        style={{ background: WELL, boxShadow: WELL_SHADE }}
      >
        {glow ? (
          <motion.span
            className="absolute rounded-2"
            style={{
              inset: WELL_PAD - 1,
              boxShadow: HALO,
              opacity: haloOpacity,
            }}
          />
        ) : null}
      </span>

      <span
        aria-hidden
        className="relative block"
        style={{ paddingBottom: skirt }}
      >
        {/* The plate line: the body sinks behind it as the cap goes down. */}
        <span className="absolute inset-0 overflow-clip rounded-t-2">
          <motion.span
            className="absolute inset-x-0 top-0 rounded-2 border border-hairline-strong"
            style={{ y, height: `calc(100% + ${skirt}px)`, background: BODY }}
          />
        </span>
        <motion.span
          className={cn(
            "relative flex rounded-2 border border-hairline",
            legend === "both"
              ? "flex-col items-start justify-between px-2.5 py-2"
              : "items-center justify-center px-4",
          )}
          style={{
            y,
            height: FACE_HEIGHT,
            minWidth: legend === "both" ? 92 : 60,
            marginInline: TAPER,
            background: FACE_FILL,
            boxShadow: FACE_EDGE,
            color: legendColor,
          }}
        >
          {legend === "key" ? (
            <span className="text-xl leading-none font-medium whitespace-nowrap">
              {glyph}
            </span>
          ) : legend === "label" ? (
            <span className="text-sm leading-none font-medium whitespace-nowrap">
              {label}
            </span>
          ) : (
            <>
              <span className="text-sm leading-none font-semibold whitespace-nowrap">
                {glyph}
              </span>
              <span className="text-[11px] leading-none whitespace-nowrap">
                {label}
              </span>
            </>
          )}
        </motion.span>
      </span>
    </button>
  );
}
