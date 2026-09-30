"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Link2,
  RotateCcw,
  X,
} from "lucide-react";
import Link from "next/link";
import { animate, motion, useMotionValue } from "motion/react";

import { InstallCommand } from "@/components/docs/install-command";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { toJsx, type TweakSchema } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";

import { SoundSwitch } from "./sound-switch";
import type { TactileItem } from "./tactile-card";
import { Segmented } from "./tweak-controls";
import { TweakPanel, type TweakState } from "./tweak-panel";
import { useTactileModule } from "./use-tactile-module";
import { VerbGlyph } from "./verb-glyph";

type StageTheme = "page" | "light" | "dark";

const noop = () => () => {};

/**
 * The panel's box as laid out, ignoring any transform on it: offsets from its
 * fixed, full-viewport container. A FLIP measured with getBoundingClientRect
 * mid-animation would measure the animation, not the layout.
 */
const layoutBox = (panel: HTMLElement) => {
  const frame = (
    panel.offsetParent as HTMLElement | null
  )?.getBoundingClientRect();
  const left = (frame?.left ?? 0) + panel.offsetLeft;
  const top = (frame?.top ?? 0) + panel.offsetTop;
  return { left, top, width: panel.offsetWidth, height: panel.offsetHeight };
};
type StageView = "preview" | "code";

const iconButton =
  "inline-flex size-9 items-center justify-center rounded-2 text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40";

/** Copies `value` and says so for a moment, in words, not only with a tick. */
function CopyAction({
  value,
  label,
  done,
  icon,
}: {
  value: string;
  label: string;
  done: string;
  icon: React.ReactNode;
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard refused (insecure context, permissions): nothing to say.
        }
      }}
      className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-2 border border-hairline-strong px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {copied ? <Check aria-hidden className="size-3.5 text-success" /> : icon}
      <span aria-live="polite">{copied ? done : label}</span>
    </button>
  );
}

/**
 * The stage: one Tactile component, large, with its tweaks beside it.
 *
 * It opens by growing out of the card that asked for it (a FLIP from the
 * card's rectangle) and closes back into it; Escape, the close button and the
 * browser's back button all close it. While it is open everything behind it is
 * `inert`, the page does not scroll, and focus returns to the opener on close.
 * The stage can wear either theme regardless of the page's, replays its demo
 * from scratch, and shows the exact JSX for the current tweaks.
 */
export function StageDialog({
  item,
  closing,
  origin,
  position,
  sound,
  onSound,
  values,
  onTweak,
  onReset,
  shareUrl,
  onNavigate,
  onRequestClose,
  onExited,
}: {
  item: TactileItem;
  closing: boolean;
  origin: HTMLElement | null;
  position: { index: number; count: number };
  sound: boolean;
  onSound: (on: boolean) => void;
  values: TweakState;
  onTweak: (key: string, value: boolean | number | string) => void;
  onReset: () => void;
  shareUrl: string;
  onNavigate: (delta: number) => void;
  onRequestClose: () => void;
  onExited: () => void;
}) {
  const motionSafe = useMotionSafe();
  const loadedModule = useTactileModule(item.name, true);
  const onClient = React.useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const [view, setView] = React.useState<StageView>("preview");
  const [theme, setTheme] = React.useState<StageTheme>("page");
  const [run, setRun] = React.useState(0);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const leaving = React.useRef(false);
  // The latest values the one-shot effects need, without re-running them.
  const latest = React.useRef({ name: item.name, onExited });
  React.useEffect(() => {
    latest.current = { name: item.name, onExited };
  });
  const titleId = `tactile-stage-title-${item.name}`;

  // The morph: the panel starts on the card's rectangle and grows to its own.
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useMotionValue(1);
  const sy = useMotionValue(1);
  const veil = useMotionValue(0);
  const face = useMotionValue(0);

  // Portal host, inert background, scroll lock, focus capture — once.
  React.useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    const siblings = Array.from(document.body.children).filter(
      (child) =>
        !child.hasAttribute("data-tactile-stage-root") &&
        !child.hasAttribute("inert"),
    );
    for (const sibling of siblings) sibling.setAttribute("inert", "");
    const root = document.documentElement;
    const gutter = window.innerWidth - root.clientWidth;
    const previous = {
      overflow: root.style.overflow,
      paddingRight: root.style.paddingRight,
    };
    root.style.overflow = "hidden";
    if (gutter > 0) root.style.paddingRight = `${gutter}px`;
    return () => {
      for (const sibling of siblings) sibling.removeAttribute("inert");
      root.style.overflow = previous.overflow;
      root.style.paddingRight = previous.paddingRight;
      // Focus goes back to the card now on show (navigation may have moved
      // on from the one that opened the stage), else to whatever opened it.
      const back =
        document
          .getElementById(`tactile-card-${latest.current.name}`)
          ?.querySelector<HTMLElement>("button[aria-label^='Open']") ??
        opener.current;
      back?.focus({ preventScroll: true });
    };
  }, []);

  // Open: FLIP from the origin card, then reveal the face. Idempotent on
  // purpose — React may run it, clean it up and run it again (StrictMode
  // does exactly that), so every run starts from the card and animates in,
  // and every cleanup stops what it started.
  React.useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !onClient || leaving.current) return;
    panel.focus({ preventScroll: true });
    const to = layoutBox(panel);
    const from = origin?.getBoundingClientRect();
    if (!motionSafe || !from || to.width === 0 || to.height === 0) {
      x.set(0);
      y.set(0);
      sx.set(1);
      sy.set(1);
      veil.set(1);
      const reveal = animate(face, 1, {
        duration: durations.fast,
        ease: easings.enter,
      });
      return () => reveal.stop();
    }
    x.set(Math.round(from.left - to.left));
    y.set(Math.round(from.top - to.top));
    sx.set(Number((from.width / to.width).toFixed(4)));
    sy.set(Number((from.height / to.height).toFixed(4)));
    veil.set(0);
    face.set(0);
    const controls = [
      animate(x, 0, springs.glide),
      animate(y, 0, springs.glide),
      animate(sx, 1, springs.glide),
      animate(sy, 1, springs.glide),
      animate(veil, 1, { duration: durations.base, ease: easings.enter }),
      animate(face, 1, {
        duration: durations.base,
        ease: easings.enter,
        delay: 0.12,
      }),
    ];
    return () => {
      for (const c of controls) c.stop();
    };
  }, [face, motionSafe, onClient, origin, sx, sy, veil, x, y]);

  // Close: back into the card if it is still on screen, otherwise a fade.
  React.useEffect(() => {
    if (!closing || leaving.current) return;
    leaving.current = true;
    const panel = panelRef.current;
    const card = document.getElementById(`tactile-card-${item.name}`);
    const to = panel ? layoutBox(panel) : undefined;
    const from = card?.getBoundingClientRect();
    const visible =
      from &&
      from.bottom > 0 &&
      from.top < window.innerHeight &&
      from.width > 0;
    const finish = () => latest.current.onExited();
    if (!motionSafe || !panel || !to || !from || !visible) {
      animate(veil, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: finish,
      });
      animate(face, 0, { duration: durations.fast, ease: easings.exit });
      return;
    }
    // The transform origin is the top-left corner and `to` is the panel's
    // untransformed box, so the target transform maps that box onto the card.
    const base = to;
    animate(face, 0, { duration: durations.fast, ease: easings.exit });
    const controls = [
      animate(x, Math.round(from.left - base.left), springs.glide),
      animate(y, Math.round(from.top - base.top), springs.glide),
      animate(sx, Number((from.width / base.width).toFixed(4)), springs.glide),
      animate(sy, Number((from.height / base.height).toFixed(4)), {
        ...springs.glide,
        onComplete: finish,
      }),
      animate(veil, 0, {
        duration: durations.base,
        ease: easings.exit,
      }),
    ];
    // Deliberately not stopped on cleanup: once leaving, the stage finishes
    // leaving, whatever re-renders around it.
    void controls;
  }, [closing, face, item.name, motionSafe, sx, sy, veil, x, y]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      onRequestClose();
      return;
    }
    // Arrows belong to whatever holds focus — a slider, a radio group, the
    // component itself — so they only page between components when the
    // dialog itself has focus.
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight") onNavigate(1);
    if (event.key === "ArrowLeft") onNavigate(-1);
  };

  const schema: TweakSchema = loadedModule?.tweaks ?? {};
  const Demo = loadedModule?.Demo;
  const snippet = `import { ${item.exportName} } from "@/components/ui/${item.name}";\n\n${toJsx(
    item.exportName,
    schema,
    values,
  )}`;

  if (!onClient) return null;

  return createPortal(
    <div
      data-tactile-stage-root=""
      className="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center sm:p-6"
    >
      <motion.div
        aria-hidden
        onClick={onRequestClose}
        style={{ opacity: veil }}
        className="absolute inset-0 bg-surface-0/75 backdrop-blur-sm"
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ x, y, scaleX: sx, scaleY: sy, transformOrigin: "0 0" }}
        className="relative flex h-dvh w-full flex-col overflow-clip border-hairline-strong bg-surface-1 outline-none sm:h-[min(820px,calc(100dvh-3rem))] sm:w-[min(1180px,calc(100vw-3rem))] sm:rounded-4 sm:border"
      >
        <motion.div
          style={{ opacity: face }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-hairline px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2">
                <VerbGlyph verb={item.verb} className="size-4" />
              </span>
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="truncate text-sm font-semibold text-foreground"
                >
                  {item.title}
                </h2>
                <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {`${item.serial} · ${item.verbLabel} · ${position.index + 1} of ${position.count}`}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onNavigate(-1)}
                disabled={position.count < 2}
                aria-label="Previous component"
                aria-keyshortcuts="ArrowLeft"
                className={iconButton}
              >
                <ChevronLeft aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate(1)}
                disabled={position.count < 2}
                aria-label="Next component"
                aria-keyshortcuts="ArrowRight"
                className={iconButton}
              >
                <ChevronRight aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                onClick={onRequestClose}
                aria-label="Close the stage"
                aria-keyshortcuts="Escape"
                className={iconButton}
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(360px,1fr)_auto] overflow-y-auto lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-1 lg:overflow-hidden">
            <section
              aria-label="Stage"
              className="flex min-h-0 min-w-0 flex-col"
            >
              <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
                <div className="w-44">
                  <Segmented
                    label="View"
                    options={[
                      { value: "preview", label: "Preview" },
                      { value: "code", label: "Code" },
                    ]}
                    value={view}
                    onChange={(next) => setView(next as StageView)}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <div className="hidden w-52 sm:block">
                    <Segmented
                      label="Theme"
                      options={[
                        { value: "page", label: "Page" },
                        { value: "light", label: "Light" },
                        { value: "dark", label: "Dark" },
                      ]}
                      value={theme}
                      onChange={(next) => setTheme(next as StageTheme)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setRun((n) => n + 1)}
                    aria-label="Replay from the start"
                    className={iconButton}
                  >
                    <RotateCcw aria-hidden className="size-4" />
                  </button>
                  <SoundSwitch on={sound} onChange={onSound} />
                </div>
              </div>

              {view === "preview" ? (
                <div
                  data-specimen-stage=""
                  data-tactile-stage=""
                  className={cn(
                    "relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-background p-6 text-foreground sm:p-10",
                    theme !== "page" && theme,
                  )}
                >
                  {Demo ? (
                    <Demo
                      key={`${item.name}-${run}`}
                      chrome
                      sound={sound}
                      {...values}
                    />
                  ) : (
                    <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      Loading the component
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-6">
                  <div className="overflow-clip rounded-3 border border-hairline bg-surface-0">
                    <div className="flex h-10 items-center justify-between border-b border-hairline px-3">
                      <span className="font-mono text-[11px] text-ink-3">
                        {`${item.name}.tsx — usage`}
                      </span>
                    </div>
                    <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-ink">
                      <code>{snippet}</code>
                    </pre>
                  </div>
                  <InstallCommand slug={item.name} />
                </div>
              )}
            </section>

            <aside
              aria-label="Tweaks and sharing"
              className="flex min-h-0 flex-col gap-5 border-t border-hairline p-4 lg:overflow-y-auto lg:border-t-0 lg:border-l"
            >
              <p className="text-sm text-ink-2">{item.tagline}</p>
              {Object.keys(schema).length > 0 ? (
                <TweakPanel
                  schema={schema}
                  values={values}
                  onChange={onTweak}
                  onReset={onReset}
                />
              ) : null}
              <div className="mt-auto flex flex-col gap-2">
                <div className="flex gap-2">
                  <CopyAction
                    value={shareUrl}
                    label="Copy link"
                    done="Link copied"
                    icon={<Link2 aria-hidden className="size-3.5" />}
                  />
                  <CopyAction
                    value={snippet}
                    label="Copy code"
                    done="Code copied"
                    icon={
                      <span aria-hidden className="font-mono text-[11px]">
                        {"</>"}
                      </span>
                    }
                  />
                </div>
                <Link
                  href={`/components/${item.name}`}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-2 text-xs text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Props, source and install
                  <ArrowUpRight aria-hidden className="size-3.5" />
                </Link>
              </div>
            </aside>
          </div>
        </motion.div>
      </motion.div>
    </div>,
    document.body,
  );
}
