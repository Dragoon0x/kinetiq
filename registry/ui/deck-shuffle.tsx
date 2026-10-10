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
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DeckShuffleElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type DeckShuffleTrigger = "mount" | "inView" | "hover" | "manual";

export type DeckShuffleProps = {
  /** The line, as a string. Wins over `text`. */
  children?: string;
  /** The line, when it is not given as children. */
  text?: string;
  /** The element that carries the line. @default "p" */
  as?: DeckShuffleElement;
  /** How many random cards each letter turns through before its own, 1 to 8. @default 4 */
  riffles?: number;
  /** How long the riffle takes to spread from the first letter to the last, ms. @default 500 */
  spread?: number;
  /** Card turns a second while riffling. @default 9 */
  speed?: number;
  /** The deck the random cards are drawn from. Empty draws letters of the same case. @default "" */
  glyphs?: string;
  /** Seed for the cards drawn and the deal's tilt. @default 0 */
  seed?: number;
  /** Draw each letter on a card tile. False flips bare letters. @default true */
  cards?: boolean;
  /** Largest hand-dealt tilt of a card, degrees. @default 1.5 */
  tilt?: number;
  /** How high a card lifts off the table while it riffles, em. @default 0.14 */
  lift?: number;
  /** The card face, any CSS colour. @default "var(--popover)" */
  face?: string;
  /** The card back's pattern, any CSS colour. @default "var(--accent-bright)" */
  back?: string;
  /** Pointing at a word, tapping it or the keys riffle it again. @default true */
  interactive?: boolean;
  /** When the deal plays. @default "inView" */
  trigger?: DeckShuffleTrigger;
  /** Deal once, or again each time the line re-enters view or is hovered. @default true */
  once?: boolean;
  /** Wait before the deal, ms. @default 0 */
  delay?: number;
  /** With trigger "manual": true deals, false turns every card face down. @default false */
  play?: boolean;
  /** A soft card-on-felt sound as each card the visitor riffled lands. @default false */
  sound?: boolean;
  /** The deal has landed, every card face up. */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

const UPPER = Array.from("ABCDEFGHJKLMNPQRSTUVWXYZ");
const LOWER = Array.from("abcdefghjkmnopqrstuvwxyz");
const DIGITS = Array.from("0123456789");
const MARKS = Array.from("&?!#%*+§");

/** The deck a letter's random cards come from: its own case and kind. */
const poolFor = (ch: string, custom: string[]): string[] => {
  if (custom.length) return custom;
  if (/\p{Lu}/u.test(ch)) return UPPER;
  if (/\p{Ll}/u.test(ch)) return LOWER;
  if (/\p{N}/u.test(ch)) return DIGITS;
  return MARKS;
};

const BACK = "\u0000back";
const LETTER = "\u0000letter";

type Riffle = {
  delay: number;
  glyphs: string[];
  from: "back" | "letter";
  speed: number;
  safe: boolean;
  /** The card is face up on its letter; quiet when it was finished early. */
  onLand: (quiet: boolean) => void;
};

type CardApi = {
  riffle: (riffle: Riffle) => void;
  finish: () => void;
  down: () => void;
  busy: () => boolean;
  node: () => HTMLElement | null;
};

type Model = {
  chars: string[];
  /** Words as runs of card indices; spaces are not cards. */
  words: number[][];
  /** Card index → its grapheme index. */
  cards: number[];
  tilts: number[];
};

function modelOf(text: string, seed: number): Model {
  const chars = graphemes(text.trim());
  const rand = lcg(hash(text) ^ (seed * 2654435761));
  const words: number[][] = [];
  const cards: number[] = [];
  const tilts: number[] = [];
  let word: number[] = [];
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (word.length) words.push(word);
      word = [];
      return;
    }
    word.push(cards.length);
    cards.push(i);
    tilts.push(rand() * 2 - 1);
  });
  if (word.length) words.push(word);
  return { chars, words, cards, tilts };
}

function Card({
  letter,
  index,
  tilt,
  cards,
  liftEm,
  register,
}: {
  letter: string;
  index: number;
  tilt: number;
  cards: boolean;
  liftEm: number;
  register: (index: number, api: CardApi | null) => void;
}) {
  const rho = useMotionValue(0);
  const lift = useMotionValue(0);
  const showLetter = useMotionValue(0);
  const showBack = useMotionValue(1);
  const mirror = useMotionValue(1);
  const nodeRef = React.useRef<HTMLSpanElement | null>(null);
  const faceRef = React.useRef<HTMLSpanElement | null>(null);
  const deck = React.useRef({
    faces: [BACK] as string[],
    k: 0,
    run: 0,
    busy: false,
    anims: [] as AnimationPlaybackControls[],
    land: null as ((quiet: boolean) => void) | null,
  });

  // Turned edge-on, a card catches less light: its face darkens with the turn.
  const shade = useTransform(rho, (r) =>
    cards ? r3((1 - Math.abs(Math.cos((r * Math.PI) / 180))) * 0.55) : 0,
  );
  const y = useTransform(lift, (l) => `${r3(-l * liftEm)}em`);
  const scale = useTransform(lift, (l) => r3(1 + 0.06 * Math.max(0, l)));
  // Lifted, the shadow is wide and soft; landed, small and close.
  const shadow = useTransform(lift, (l) => {
    if (!cards) return "none";
    const k = clamp(l, 0, 1);
    return `0 ${r3(0.03 + 0.16 * k)}em ${r3(0.05 + 0.34 * k)}em color-mix(in oklab, black ${Math.round(14 + 16 * k)}%, transparent)`;
  });

  const show = React.useCallback(
    (k: number) => {
      const d = deck.current;
      if (k === d.k) return;
      d.k = k;
      const f = d.faces[k] ?? LETTER;
      const node = faceRef.current;
      if (f === BACK) {
        showBack.set(1);
        showLetter.set(0);
        if (node) node.textContent = "";
      } else if (f === LETTER) {
        showBack.set(0);
        showLetter.set(1);
        if (node) node.textContent = "";
      } else {
        showBack.set(0);
        showLetter.set(0);
        if (node) node.textContent = f;
      }
      // Past edge-on the card shows its other side: the face is drawn
      // mirrored so it reads the right way round.
      mirror.set(k % 2 ? -1 : 1);
    },
    [mirror, showBack, showLetter],
  );

  React.useEffect(
    () =>
      rho.on("change", (r) => {
        const d = deck.current;
        show(clamp(Math.floor((r + 90) / 180), 0, d.faces.length - 1));
      }),
    [rho, show],
  );

  React.useEffect(() => {
    const d = deck.current;
    const stop = () => {
      for (const a of d.anims) a.stop();
      d.anims = [];
    };
    const settleFace = (face: string) => {
      d.faces = [face];
      d.k = -1;
      rho.jump(0);
      show(0);
    };
    /** Hands the card's landing to whoever asked for the riffle, once. */
    const landed = (quiet: boolean) => {
      const land = d.land;
      d.land = null;
      land?.(quiet);
    };
    const api: CardApi = {
      busy: () => d.busy,
      node: () => nodeRef.current,
      finish: () => {
        d.run += 1;
        stop();
        d.busy = false;
        lift.jump(0);
        showLetter.jump(1);
        showBack.jump(0);
        settleFace(LETTER);
        // A riffle cut short still lands, so a deal still completes.
        landed(true);
      },
      down: () => {
        d.run += 1;
        stop();
        d.busy = false;
        d.land = null;
        lift.jump(0);
        settleFace(BACK);
      },
      riffle: ({ delay, glyphs, from, speed, safe, onLand }) => {
        d.run += 1;
        const run = d.run;
        stop();
        // A riffle that replaces one in flight lands that one first.
        landed(true);
        d.land = onLand;
        d.busy = true;
        lift.jump(0);
        if (!safe) {
          // Reduced motion: no turn, no lift — the face cross-fades.
          settleFace(LETTER);
          const fromBack = from === "back";
          const fade = { duration: durations.base, delay, ease: easings.move };
          const a = animate(showLetter, fromBack ? [0, 1] : [1, 0, 1], fade);
          d.anims = [a, animate(showBack, fromBack ? [1, 0] : [0, 1, 0], fade)];
          void a.then(() => {
            if (run !== d.run) return;
            d.busy = false;
            landed(false);
          });
          return;
        }
        const turns = glyphs.length + 1;
        d.faces = [from === "back" ? BACK : LETTER, ...glyphs, LETTER];
        d.k = -1;
        rho.jump(0);
        show(0);
        const half = 1 / Math.max(1, speed);
        const spin = animate(rho, 180 * turns - 90, {
          duration: half * (turns - 0.5),
          delay,
          ease: "linear",
        });
        d.anims = [animate(lift, 1, { ...springs.snap, delay }), spin];
        void spin.then(() => {
          if (run !== d.run) return;
          // The last quarter-turn hands its speed to the snap spring, so the
          // card lands flat with one small wobble while its lift drops on
          // recoil and the shadow tightens under it.
          const land = animate(rho, 180 * turns, {
            ...springs.snap,
            velocity: 180 * speed,
          });
          d.anims.push(land, animate(lift, 0, springs.recoil));
          landed(false);
          void land.then(() => {
            if (run !== d.run) return;
            d.busy = false;
            settleFace(LETTER);
          });
        });
      },
    };
    register(index, api);
    return () => {
      stop();
      register(index, null);
    };
  }, [index, register, rho, lift, show, showBack, showLetter]);

  return (
    <span
      ref={nodeRef}
      className="relative inline-block"
      style={{ perspective: "4.5em", marginInline: cards ? "0.035em" : 0 }}
    >
      <motion.span
        className={cn(
          "relative inline-flex justify-center",
          // Tiles are near-uniform, like a deck; bare letters keep their own
          // advance so the line still reads as set type.
          cards &&
            "min-w-[0.7em] rounded-[0.12em] border border-hairline-strong [background-color:var(--deck-face)] px-[0.1em]",
        )}
        style={{
          rotateY: rho,
          rotate: r3(tilt),
          y,
          scale,
          boxShadow: shadow,
        }}
      >
        <motion.span
          className="relative inline-flex justify-center"
          style={{ scaleX: mirror }}
        >
          <motion.span style={{ opacity: showLetter }}>{letter}</motion.span>
          <span
            ref={faceRef}
            className="absolute inset-0 flex justify-center select-none"
          />
        </motion.span>
        <motion.span
          className={cn(
            "pointer-events-none absolute rounded-[0.08em] [background-image:repeating-linear-gradient(45deg,color-mix(in_oklab,var(--deck-back)_60%,transparent)_0_0.05em,transparent_0.05em_0.15em)]",
            cards
              ? "inset-[0.08em] border-[0.035em] border-[color-mix(in_oklab,var(--deck-back)_55%,transparent)]"
              : "inset-x-[0.06em] inset-y-[0.2em]",
          )}
          style={{ opacity: showBack }}
        />
        {cards ? (
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[color-mix(in_oklab,black_40%,transparent)]"
            style={{ opacity: shade }}
          />
        ) : null}
      </motion.span>
    </span>
  );
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

/**
 * Every letter is a little playing card. Dealt face down, the row reads as
 * card backs; then the deal riffles across the line: each card lifts on the
 * snap spring and turns over and over about its upright axis in 3D, every
 * half-turn showing a fresh card drawn from a seeded deck of the same case,
 * until the last turn shows its own letter — that final quarter-turn hands
 * its speed to the snap spring so the card lands flat with a small wobble,
 * and the lift drops on recoil as the drop shadow tightens beneath it.
 * Pointing at a word riffles it again; on touch a tap does.
 *
 * The line is read once from an sr-only copy; the cards are hidden from
 * assistive technology, and the true letter is always each card's own text,
 * so copying the line copies the words. A keyboard handle over the line
 * riffles it with Enter, or a word at a time with the arrow keys. Card faces
 * change only when a card turns edge-on — a write to the card's own overlay,
 * not a render. Under reduced motion the cards do not turn or lift: each
 * face cross-fades from its back to its letter.
 */
export function DeckShuffle({
  children,
  text,
  as = "p",
  riffles = 4,
  spread = 500,
  speed = 9,
  glyphs = "",
  seed = 0,
  cards = true,
  tilt = 1.5,
  lift = 0.14,
  face = "var(--popover)",
  back = "var(--accent-bright)",
  interactive = true,
  trigger = "inView",
  once = true,
  delay = 0,
  play = false,
  sound = false,
  onComplete,
  className,
}: DeckShuffleProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const line = (typeof children === "string" ? children : text) ?? "";
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;

  const model = React.useMemo(() => modelOf(line, seed), [line, seed]);
  const [entrance, setEntrance] = React.useState({ n: 0, on: false });
  const started = entrance.on && (trigger !== "manual" || play);
  const [probe, setProbe] = React.useState(-1);
  const [keyed, setKeyed] = React.useState(false);

  const deck = React.useRef(new Map<number, CardApi>());
  const dealt = React.useRef(false);
  const draws = React.useRef(0);
  const deals = React.useRef(0);
  const hovered = React.useRef(-1);
  const cfg = React.useRef({
    riffles,
    spread,
    speed,
    glyphs,
    seed,
    motionSafe,
    audio,
    onComplete,
  });
  React.useLayoutEffect(() => {
    cfg.current = {
      riffles,
      spread,
      speed,
      glyphs,
      seed,
      motionSafe,
      audio,
      onComplete,
    };
  });

  const register = React.useCallback((index: number, api: CardApi | null) => {
    if (api) deck.current.set(index, api);
    else deck.current.delete(index);
  }, []);

  /** Riffles a run of cards; the visitor's riffles are heard as they land. */
  const deal = React.useCallback(
    (list: number[], visitor: boolean, entering: boolean) => {
      const c = cfg.current;
      const total = Math.max(1, model.cards.length);
      const custom = Array.from(c.glyphs.replace(/\s/g, ""));
      const count = clamp(Math.round(c.riffles), 1, 8);
      // A word riffles over its share of the line's spread, never slower.
      const spreadS =
        (Math.max(0, c.spread) / 1000) *
        (entering ? 1 : clamp((list.length / total) * 1.6, 0.3, 1));
      draws.current += 1;
      const run = draws.current;
      // Only the latest deal reports: one replaced mid-air (StrictMode, a
      // replay) lands its cards quietly and says nothing.
      if (entering) deals.current += 1;
      const dealNo = deals.current;
      const report = () => {
        if (entering && dealNo === deals.current) cfg.current.onComplete?.();
      };
      let left = list.length;
      // Activation is checked once per riffle: a hover is not a gesture.
      const heard =
        visitor &&
        typeof navigator !== "undefined" &&
        (navigator as { userActivation?: { hasBeenActive: boolean } })
          .userActivation?.hasBeenActive !== false;
      list.forEach((ci, j) => {
        const card = deck.current.get(ci);
        if (!card || (!entering && card.busy())) {
          left -= 1;
          return;
        }
        const ch = model.chars[model.cards[ci] ?? 0] ?? "";
        const pool = poolFor(ch, custom);
        const rand = lcg(
          hash(`${ch}:${ci}`) ^ (c.seed * 40503) ^ (run * 2246822519),
        );
        const picked: string[] = [];
        for (let k = 0; k < count; k += 1) {
          let g = pool[Math.floor(rand() * pool.length)] ?? ch;
          if (g === ch || g === picked[picked.length - 1]) {
            g = pool[(pool.indexOf(g) + 1) % pool.length] ?? g;
          }
          picked.push(g);
        }
        const at = list.length > 1 ? (spreadS * j) / (list.length - 1) : 0;
        card.riffle({
          delay: c.motionSafe ? at : j * cascade(list.length),
          glyphs: picked,
          from: entering ? "back" : "letter",
          speed: clamp(c.speed, 2, 30),
          safe: c.motionSafe,
          onLand: (quiet) => {
            if (heard && !quiet) {
              const node = card.node();
              c.audio.play("paper", {
                pitch: r3(0.85 + 0.35 * (ci / total)),
                gain: 0.22,
                pan: node
                  ? panFrom(node.getBoundingClientRect().left, null)
                  : 0,
              });
            }
            left -= 1;
            if (left === 0) report();
          },
        });
      });
      if (left === 0) report();
    },
    [model],
  );

  const all = React.useMemo(() => model.cards.map((_, i) => i), [model]);

  React.useEffect(() => {
    if (started) {
      dealt.current = true;
      deal(all, false, true);
    } else {
      dealt.current = false;
      for (const card of deck.current.values()) card.down();
    }
  }, [started, entrance.n, all, deal]);

  // Off screen or in a hidden tab, a riffle in flight lands at once rather
  // than animating unseen.
  React.useEffect(() => {
    if (running || !dealt.current) return;
    for (const card of deck.current.values()) card.finish();
  }, [running]);

  const timer = React.useRef<number | null>(null);
  const begin = React.useCallback((restart: boolean, wait: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on && !restart ? e : { n: e.n + 1, on: true }));
    }, wait);
  }, []);
  const reset = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? { n: e.n, on: false } : e));
    }, 0);
  }, []);

  React.useEffect(() => {
    if (trigger === "mount") begin(false, delay);
    if (trigger === "manual") {
      if (play) begin(true, delay);
      else reset();
    }
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [trigger, play, delay, begin, reset]);

  const seen = React.useRef({ trigger, once, delay, played: false });
  React.useLayoutEffect(() => {
    seen.current = { ...seen.current, trigger, once, delay };
    if (started) seen.current.played = true;
  });

  const bindRoot = React.useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        setOnScreen(visible);
        const t = seen.current;
        if (t.trigger !== "inView") return;
        if (visible) begin(false, t.delay);
        else if (!t.once && t.played) reset();
      });
      watcher.observe(node);
      return () => watcher.disconnect();
    },
    [begin, reset],
  );

  const wordAt = (target: EventTarget | null) => {
    const node =
      target instanceof Element ? target.closest("[data-deck-word]") : null;
    const raw = node?.getAttribute("data-deck-word");
    return raw === null || raw === undefined ? null : Number(raw);
  };

  const riffleWord = (w: number) => {
    const list = model.words[w];
    if (list && dealt.current) deal(list, true, false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    const n = model.words.length;
    if (n === 0) return;
    let to: number | undefined;
    switch (event.key) {
      case "Enter":
      case " ":
        event.preventDefault();
        if (dealt.current) deal(all, true, false);
        else begin(true, 0);
        return;
      case "ArrowRight":
      case "ArrowDown":
        to = probe < 0 ? 0 : Math.min(n - 1, probe + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        to = probe < 0 ? n - 1 : Math.max(0, probe - 1);
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = n - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setProbe(to);
    riffleWord(to);
  };

  const Wrapper = as === "span" ? "span" : "div";
  const Tag = as;

  return (
    <Wrapper
      ref={bindRoot}
      className={cn(
        "relative",
        as === "span" ? "inline-block" : "block",
        className,
      )}
      style={
        {
          "--deck-face": face,
          "--deck-back": back,
        } as React.CSSProperties
      }
      onPointerEnter={() => {
        if (trigger === "hover") begin(!once, delay);
      }}
      onPointerLeave={() => {
        hovered.current = -1;
      }}
    >
      <Tag className="m-0">
        <span className="sr-only select-none">{line}</span>
        <span
          aria-hidden
          // A word gap reads wider than the gap between cards; on the space,
          // so a wrapped line never starts indented.
          className={cards ? "[word-spacing:0.2em]" : undefined}
          onPointerOver={(event) => {
            if (!interactive) return;
            const w = wordAt(event.target);
            if (w === null || w === hovered.current) return;
            hovered.current = w;
            riffleWord(w);
          }}
          onPointerOut={(event) => {
            const to = wordAt(event.relatedTarget);
            if (to !== hovered.current) hovered.current = -1;
          }}
        >
          {model.words.map((list, w) => (
            <React.Fragment key={w}>
              {w > 0 ? " " : null}
              <span
                data-deck-word={w}
                className={cn(
                  "relative inline-block whitespace-nowrap",
                  keyed &&
                    probe === w &&
                    "after:absolute after:inset-x-[0.12em] after:-bottom-[0.14em] after:h-[0.07em] after:rounded-full after:bg-[var(--deck-back)]",
                )}
              >
                {list.map((ci) => (
                  <Card
                    key={ci}
                    index={ci}
                    letter={model.chars[model.cards[ci] ?? 0] ?? ""}
                    tilt={(model.tilts[ci] ?? 0) * clamp(tilt, 0, 8)}
                    cards={cards}
                    liftEm={Math.max(0, lift)}
                    register={register}
                  />
                ))}
              </span>
            </React.Fragment>
          ))}
        </span>
      </Tag>
      {interactive && model.words.length > 0 ? (
        <>
          <span
            role="button"
            tabIndex={0}
            aria-label="Shuffle the letters"
            aria-describedby={hintId}
            onKeyDown={onKeyDown}
            onFocus={(event) => {
              if (trigger === "hover") begin(!once, delay);
              setKeyed(event.currentTarget.matches(":focus-visible"));
            }}
            onBlur={() => setKeyed(false)}
            className="pointer-events-none absolute inset-0 rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          <span id={hintId} className="sr-only">
            Enter shuffles the whole line; Left and Right shuffle one word at a
            time.
          </span>
        </>
      ) : null}
    </Wrapper>
  );
}
