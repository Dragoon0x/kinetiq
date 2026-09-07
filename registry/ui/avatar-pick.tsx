"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AvatarOption = {
  id: string;
  /** One or two characters drawn on the disc. */
  initials: string;
  /** Any CSS colour — pass a theme token so both themes read. */
  tint: string;
  /** The accessible name for this face. */
  label: string;
};

export type AvatarPickProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The faces to choose from. */
  options: AvatarOption[];
  /** Controlled id. */
  value?: string;
  /** Initial id for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Shows the tile that opens a real file picker. @default true */
  allowUpload?: boolean;
  /** Visible group label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** The uploaded face reserves this id, so it can never collide with a tint. */
const UPLOAD_ID = "upload";

/**
 * A face chooser. One ring travels between the tiles on `snap` — a shared
 * `layoutId` means it is the same ring moving, not nine rings blinking — and
 * the chosen face puffs to 1.08 on `recoil` while the rest lose a little
 * saturation on a tween, so the choice reads from across the page.
 *
 * Faces are procedural: initials on a disc tinted from whatever colour the
 * option carries, no image request. The last tile opens a real file picker and
 * previews the chosen image in place, and its object URL is revoked when it is
 * replaced. It is a radio group with a roving tabindex: arrows step and wrap,
 * Home and End jump to the ends, Space and Enter select — or, on the upload
 * tile, open the picker. Under reduced motion the ring jumps and nothing puffs.
 */
export function AvatarPick({
  ref,
  options,
  value,
  defaultValue,
  onValueChange,
  allowUpload = true,
  label,
  className,
  "aria-label": ariaLabel,
}: AvatarPickProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  // Prefixed so two choosers on one page never share a travelling ring.
  const ringId = `${baseId}-ring`;

  const [uncontrolled, setUncontrolled] = React.useState<string>(
    defaultValue ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;

  const [preview, setPreview] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const tileRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // The previous object URL is released the moment it is replaced, and again
  // when the chooser unmounts — a blob left behind is a leak, not a cache.
  React.useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const tiles = React.useMemo(
    () =>
      allowUpload
        ? [...options.map((o) => o.id), UPLOAD_ID]
        : options.map((o) => o.id),
    [options, allowUpload],
  );
  const currentIndex = tiles.indexOf(current);
  const roving = currentIndex >= 0 ? currentIndex : 0;

  const select = (id: string) => {
    // The upload tile is only selectable once it holds an image.
    if (id === UPLOAD_ID && !preview) return;
    if (id === current) return;
    if (!isControlled) setUncontrolled(id);
    onValueChange?.(id);
  };

  const focusTile = (index: number) => {
    const wrapped = (index + tiles.length) % tiles.length;
    tileRefs.current[wrapped]?.focus();
    select(tiles[wrapped] ?? "");
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const key = event.key;
    if (key === "ArrowRight" || key === "ArrowDown") {
      event.preventDefault();
      focusTile(index + 1);
    } else if (key === "ArrowLeft" || key === "ArrowUp") {
      event.preventDefault();
      focusTile(index - 1);
    } else if (key === "Home") {
      event.preventDefault();
      focusTile(0);
    } else if (key === "End") {
      event.preventDefault();
      focusTile(tiles.length - 1);
    } else if (key === " " && tiles[index] !== UPLOAD_ID) {
      // The upload tile keeps the native Space, which fires its click and
      // opens the picker; every other tile selects.
      event.preventDefault();
      select(tiles[index] ?? "");
    }
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clearing the input lets the same file be picked twice in a row.
    event.target.value = "";
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    if (!isControlled) setUncontrolled(UPLOAD_ID);
    onValueChange?.(UPLOAD_ID);
  };

  const renderTile = (
    id: string,
    index: number,
    accessibleName: string,
    onActivate: (() => void) | undefined,
    face: React.ReactNode,
  ) => {
    const chosen = id === current;
    const dimmed = currentIndex >= 0 && !chosen;
    return (
      <button
        key={id}
        ref={(node) => {
          tileRefs.current[index] = node;
        }}
        type="button"
        role="radio"
        aria-checked={chosen}
        aria-label={accessibleName}
        tabIndex={index === roving ? 0 : -1}
        onClick={onActivate ?? (() => select(id))}
        onKeyDown={(event) => handleKeyDown(event, index)}
        className={cn(
          "relative rounded-full outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {chosen ? (
          motionSafe ? (
            <motion.span
              aria-hidden
              layoutId={ringId}
              transition={springs.snap}
              className="pointer-events-none absolute -inset-2 rounded-full border-2 border-cobalt-bright"
            />
          ) : (
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-2 rounded-full border-2 border-cobalt-bright"
            />
          )
        ) : null}

        <motion.span
          className="block"
          style={{ originX: 0.5, originY: 0.5 }}
          animate={{
            scale: motionSafe && chosen ? 1.08 : 1,
            filter: dimmed ? "saturate(0.55)" : "saturate(1)",
          }}
          transition={{
            scale: motionSafe ? springs.recoil : { duration: 0 },
            filter: { duration: durations.base, ease: easings.move },
          }}
        >
          {face}
        </motion.span>
      </button>
    );
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      {label ? (
        <div id={labelId} className="text-sm font-semibold">
          {label}
        </div>
      ) : null}

      {/* The padding is the room the travelling ring needs, and the gap keeps
          two neighbouring rings from touching; the focus outline sits inside
          the ring's band so the two never draw over each other. */}
      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="flex flex-wrap gap-5 p-2"
      >
        {options.map((option, index) =>
          renderTile(
            option.id,
            index,
            option.label,
            undefined,
            <span
              aria-hidden
              className="flex size-12 items-center justify-center rounded-full border text-xs font-semibold"
              style={{
                color: option.tint,
                backgroundColor: `color-mix(in oklab, ${option.tint} 18%, transparent)`,
                borderColor: `color-mix(in oklab, ${option.tint} 45%, transparent)`,
              }}
            >
              {option.initials}
            </span>,
          ),
        )}

        {allowUpload
          ? renderTile(
              UPLOAD_ID,
              options.length,
              preview ? "Uploaded photo — choose another" : "Upload a photo",
              () => {
                // A held photo selects on the first press and re-opens the
                // picker on the next, so replacing it never needs a second
                // control.
                if (preview && current !== UPLOAD_ID) select(UPLOAD_ID);
                else inputRef.current?.click();
              },
              <span
                aria-hidden
                className={cn(
                  "flex size-12 items-center justify-center rounded-full border border-dashed border-hairline-strong bg-cover bg-center text-ink-3 transition-colors duration-150",
                  !preview &&
                    "hover:border-cobalt-bright/60 hover:text-foreground",
                  preview && "border-solid",
                )}
                style={
                  preview ? { backgroundImage: `url(${preview})` } : undefined
                }
              >
                {preview ? null : (
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M12 6v12M6 12h12" />
                  </svg>
                )}
              </span>,
            )
          : null}
      </div>

      {allowUpload ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={handleFile}
        />
      ) : null}
    </div>
  );
}
