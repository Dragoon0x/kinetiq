"use client";

import * as React from "react";

import { createPortal } from "react-dom";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const POSITION_CLASSES = {
  "bottom-right": "right-0 bottom-0",
  "bottom-left": "bottom-0 left-0",
  "top-right": "top-0 right-0",
  "top-left": "top-0 left-0",
} as const;

export type ToastPosition = keyof typeof POSITION_CLASSES;

export type ToastVariant = "info" | "success" | "warn" | "danger";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss timeout in ms. Non-positive values persist the toast. */
  duration?: number;
  action?: { label: string; onClick: () => void };
};

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
  action?: { label: string; onClick: () => void };
};

type ToastContextValue = {
  /** Queues a toast and returns its id for programmatic dismissal. */
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** Imperative toast handle. Must be called under `<ToastProvider>`. */
export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast() must be used within <ToastProvider>.");
  }
  return context;
}

const VARIANT_META = {
  info: { icon: Info, rule: "bg-primary", tint: "text-primary" },
  success: { icon: CircleCheck, rule: "bg-success", tint: "text-success" },
  warn: { icon: TriangleAlert, rule: "bg-warn", tint: "text-warn" },
  danger: { icon: CircleAlert, rule: "bg-destructive", tint: "text-destructive" },
} as const;

const MODIFIER_KEYS = ["altKey", "ctrlKey", "metaKey", "shiftKey"] as const;
type ModifierKey = (typeof MODIFIER_KEYS)[number];
const isModifierKey = (key: string): key is ModifierKey =>
  (MODIFIER_KEYS as readonly string[]).includes(key);

const DEFAULT_HOTKEY = ["altKey", "KeyT"];
const SWIPE_THRESHOLD = 80;

/** Hydration-safe "is the DOM available" check for portal rendering. */
const emptySubscribe = () => () => {};
const useIsMounted = () =>
  React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

export type ToastProviderProps = {
  children?: React.ReactNode;
  /** Viewport corner the readings arrive at. */
  position?: ToastPosition;
  /** Max simultaneously visible toasts; extras wait in a FIFO queue. */
  max?: number;
  /**
   * Render the viewport into `document.body`. Set false to contain it inside
   * the nearest `position: relative` ancestor (previews, embedded stages).
   */
  portal?: boolean;
  /**
   * Keyboard chord that focuses the notifications region: modifier flags
   * (`"altKey"`, `"ctrlKey"`, `"metaKey"`, `"shiftKey"`) plus one
   * `KeyboardEvent.code`. Defaults to `["altKey", "KeyT"]` (Alt+T).
   */
  hotkey?: string[];
};

/**
 * Messages that queue like readings. Toasts arrive from the viewport edge on
 * `recoil` (a slight double-bounce), the stack recedes in depth — older
 * readings scale down 0.04 and shift ~10px per level on `glide` — and a 1px
 * hairline drains linearly over each toast's duration. Hover or focus pauses
 * every timer; swiping horizontally past the velocity-projected threshold
 * dismisses in the drag direction, otherwise the card snaps back. Exits
 * slide toward the edge and fade at 0.6×.
 */
export function ToastProvider({
  children,
  position = "bottom-right",
  max = 3,
  portal = true,
  hotkey = DEFAULT_HOTKEY,
}: ToastProviderProps) {
  const motionSafe = useMotionSafe();
  const [active, setActive] = React.useState<ToastItem[]>([]);
  const [paused, setPaused] = React.useState(false);
  const mounted = useIsMounted();
  const activeRef = React.useRef<ToastItem[]>([]);
  const queueRef = React.useRef<ToastItem[]>([]);
  const dismissHandlersRef = React.useRef(new Map<string, () => void>());
  const regionRef = React.useRef<HTMLDivElement | null>(null);
  const hoverRef = React.useRef(false);
  const focusRef = React.useRef(false);
  const counterRef = React.useRef(0);
  const idBase = React.useId();

  const commit = React.useCallback((next: ToastItem[]) => {
    activeRef.current = next;
    setActive(next);
  }, []);

  /** Removes a toast from the stack and promotes the next queued reading. */
  const remove = React.useCallback(
    (id: string) => {
      const current = activeRef.current;
      if (!current.some((item) => item.id === id)) return;
      const next = current.filter((item) => item.id !== id);
      const promoted = queueRef.current.shift();
      commit(promoted ? [...next, promoted] : next);
    },
    [commit],
  );

  const toast = React.useCallback(
    (input: ToastInput): string => {
      counterRef.current += 1;
      const item: ToastItem = {
        id: `${idBase}-${counterRef.current}`,
        title: input.title,
        description: input.description,
        variant: input.variant ?? "info",
        duration: input.duration ?? 5000,
        action: input.action,
      };
      if (activeRef.current.length >= max) queueRef.current.push(item);
      else commit([...activeRef.current, item]);
      return item.id;
    },
    [commit, idBase, max],
  );

  const dismiss = React.useCallback(
    (id: string) => {
      queueRef.current = queueRef.current.filter((item) => item.id !== id);
      const handler = dismissHandlersRef.current.get(id);
      if (handler) handler();
      else remove(id);
    },
    [remove],
  );

  const registerDismiss = React.useCallback((id: string, fn: () => void) => {
    dismissHandlersRef.current.set(id, fn);
    return () => {
      dismissHandlersRef.current.delete(id);
    };
  }, []);

  const contextValue = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  const syncPaused = React.useCallback(() => {
    setPaused(hoverRef.current || focusRef.current);
  }, []);

  // Hotkey chord focuses the notifications region.
  React.useEffect(() => {
    if (hotkey.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const matches = hotkey.every((key) =>
        isModifierKey(key) ? event[key] : event.code === key,
      );
      if (matches) {
        event.preventDefault();
        regionRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hotkey]);

  const isTop = position.startsWith("top");

  const region = (
    <div
      ref={regionRef}
      role="region"
      aria-label="Notifications"
      tabIndex={-1}
      onPointerEnter={() => {
        hoverRef.current = true;
        syncPaused();
      }}
      onPointerLeave={() => {
        hoverRef.current = false;
        syncPaused();
      }}
      onFocusCapture={() => {
        focusRef.current = true;
        syncPaused();
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          focusRef.current = false;
          syncPaused();
        }
      }}
      className={cn(
        "z-50 max-w-full p-4",
        portal ? "fixed" : "absolute",
        POSITION_CLASSES[position],
      )}
    >
      <ol
        className={cn(
          motionSafe
            ? cn(
                "grid",
                isTop ? "items-start" : "items-end",
                position.endsWith("right")
                  ? "justify-items-end"
                  : "justify-items-start",
              )
            : cn("flex gap-2", isTop ? "flex-col-reverse" : "flex-col"),
        )}
      >
        <AnimatePresence>
          {active.map((item, index) => (
            <ToastCard
              key={item.id}
              item={item}
              level={active.length - 1 - index}
              position={position}
              paused={paused}
              motionSafe={motionSafe}
              onRemove={remove}
              registerDismiss={registerDismiss}
            />
          ))}
        </AnimatePresence>
      </ol>
    </div>
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {portal ? (mounted ? createPortal(region, document.body) : null) : region}
    </ToastContext.Provider>
  );
}

type ToastCardProps = {
  item: ToastItem;
  /** Depth in the stack: 0 is the newest reading. */
  level: number;
  position: ToastPosition;
  paused: boolean;
  motionSafe: boolean;
  onRemove: (id: string) => void;
  registerDismiss: (id: string, fn: () => void) => () => void;
};

function ToastCard({
  item,
  level,
  position,
  paused,
  motionSafe,
  onRemove,
  registerDismiss,
}: ToastCardProps) {
  const x = useMotionValue(0);
  /** Fraction of the duration remaining — the pausable countdown model. */
  const progress = useMotionValue(1);
  const removedRef = React.useRef(false);

  const isTop = position.startsWith("top");
  const edgeDir = position.endsWith("right") ? 1 : -1;
  const meta = VARIANT_META[item.variant];
  const VariantIcon = meta.icon;

  const requestDismiss = React.useCallback(
    (direction?: number) => {
      if (removedRef.current) return;
      removedRef.current = true;
      if (motionSafe) {
        // Momentum continuation: swipes keep travelling in the drag
        // direction; timed/programmatic exits slide toward the edge.
        const target =
          direction === undefined
            ? edgeDir * distances.shift
            : direction * 360;
        animate(x, target, exitFor(durations.base));
      }
      onRemove(item.id);
    },
    [motionSafe, edgeDir, x, onRemove, item.id],
  );

  React.useEffect(
    () => registerDismiss(item.id, requestDismiss),
    [registerDismiss, item.id, requestDismiss],
  );

  // Countdown drains the remaining fraction; pausing stops the animation and
  // the residue in the motion value is the time still owed.
  React.useEffect(() => {
    if (paused || removedRef.current) return;
    if (!Number.isFinite(item.duration) || item.duration <= 0) return;
    const remaining = progress.get() * item.duration;
    const controls = animate(progress, 0, {
      duration: remaining / 1000,
      ease: "linear",
      onComplete: () => requestDismiss(),
    });
    return () => controls.stop();
  }, [paused, item.duration, progress, requestDismiss]);

  return (
    <motion.li
      role={item.variant === "danger" ? "alert" : "status"}
      layout={false}
      initial={
        motionSafe
          ? { opacity: 0, x: edgeDir * distances.shift }
          : { opacity: 0 }
      }
      animate={
        motionSafe
          ? {
              opacity: 1,
              x: 0,
              y: (isTop ? -1 : 1) * level * 10,
              scale: 1 - level * 0.04,
            }
          : { opacity: 1 }
      }
      exit={
        motionSafe
          ? { opacity: 0, transition: exitFor(durations.base) }
          : { opacity: 0, transition: { duration: durations.fast } }
      }
      transition={
        motionSafe
          ? {
              x: springs.recoil,
              y: springs.glide,
              scale: springs.glide,
              opacity: { duration: durations.base, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
      drag="x"
      dragMomentum={false}
      dragSnapToOrigin={motionSafe}
      dragTransition={{ bounceStiffness: 640, bounceDamping: 42 }}
      onDragEnd={(_event, info) => {
        // Velocity projection: a flick counts even from a short offset.
        const projected = info.offset.x + info.velocity.x * 0.2;
        if (Math.abs(projected) > SWIPE_THRESHOLD) {
          requestDismiss(projected > 0 ? 1 : -1);
        } else if (!motionSafe) {
          x.set(0);
        }
      }}
      style={{
        x,
        gridArea: "1 / 1",
        zIndex: 10 - level,
        transformOrigin: isTop ? "center top" : "center bottom",
      }}
      className="relative w-80 max-w-full touch-pan-y select-none"
    >
      <div className="border-border bg-popover text-popover-foreground relative overflow-hidden rounded-3 border shadow-md">
        <span
          aria-hidden
          className={cn("absolute inset-y-0 left-0 w-[3px]", meta.rule)}
        />
        <div className="flex items-start gap-2.5 py-3 pr-2.5 pl-4">
          <VariantIcon
            aria-hidden
            className={cn("mt-0.5 size-4 shrink-0", meta.tint)}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug font-medium">{item.title}</p>
            {item.description && (
              <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
                {item.description}
              </p>
            )}
            {item.action && (
              <button
                type="button"
                onClick={() => {
                  item.action?.onClick();
                  requestDismiss();
                }}
                className="border-input hover:bg-accent mt-2 inline-flex h-6 items-center rounded-1 border bg-transparent px-2 text-xs font-medium"
              >
                {item.action.label}
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => requestDismiss()}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-2"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
        <motion.span
          aria-hidden
          style={{ scaleX: progress }}
          className="bg-primary/40 absolute inset-x-0 bottom-0 h-px origin-left"
        />
      </div>
    </motion.li>
  );
}
