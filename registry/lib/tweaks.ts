/**
 * Tweaks — the live parameters a Tactile component exposes on its stage.
 *
 * A schema is declared once, next to the demo, and every key in it is the
 * name of a real prop on the component. That one decision buys three things:
 * the tweak panel is generated from the schema, the share link carries only
 * the values that differ from the defaults, and "copy code" prints the JSX a
 * reader would actually write — `<GelSwitch viscosity={0.4} />` — rather
 * than a blob of demo code.
 */

export type ToggleTweak = {
  kind: "toggle";
  label: string;
  default: boolean;
};

export type RangeTweak = {
  kind: "range";
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
  /** Printed after the value in the panel, e.g. "ms", "px", "%". */
  unit?: string;
};

export type ChoiceTweak = {
  kind: "choice";
  label: string;
  default: string;
  options: readonly string[];
  /** Display names for options whose value is not already readable. */
  names?: Readonly<Record<string, string>>;
};

export type TweakSpec = ToggleTweak | RangeTweak | ChoiceTweak;
export type TweakSchema = Readonly<Record<string, TweakSpec>>;

export type TweakValue<T extends TweakSpec> = T extends ToggleTweak
  ? boolean
  : T extends RangeTweak
    ? number
    : T extends { options: readonly (infer O)[] }
      ? O
      : string;

export type TweakValues<S extends TweakSchema> = {
  -readonly [K in keyof S]: TweakValue<S[K]>;
};

/** Every Tactile demo takes its schema's values (all optional) and `sound`. */
export type TactileDemoProps<S extends TweakSchema> = Partial<
  TweakValues<S>
> & {
  sound?: boolean;
};

/** Identity, typed: keeps the literal option lists for the value types. */
export const defineTweaks = <const S extends TweakSchema>(schema: S): S =>
  schema;

export function defaultsOf<S extends TweakSchema>(schema: S): TweakValues<S> {
  const out: Record<string, boolean | number | string> = {};
  for (const [key, spec] of Object.entries(schema)) out[key] = spec.default;
  return out as TweakValues<S>;
}

/** Rounds a range value to its step, so 0.30000000000000004 never reaches a URL. */
export function snapToStep(spec: RangeTweak, value: number): number {
  const clamped = Math.min(spec.max, Math.max(spec.min, value));
  const steps = Math.round((clamped - spec.min) / spec.step);
  const decimals = (String(spec.step).split(".")[1] ?? "").length;
  return Number((spec.min + steps * spec.step).toFixed(decimals));
}

/**
 * The share-link form: `viscosity:0.4,fill:off`, non-default values only,
 * in schema order. Readable in the address bar, stable across reloads.
 */
export function encodeTweaks<S extends TweakSchema>(
  schema: S,
  values: Partial<TweakValues<S>>,
): string {
  const parts: string[] = [];
  for (const [key, spec] of Object.entries(schema)) {
    const value = (values as Record<string, unknown>)[key];
    if (value === undefined || value === spec.default) continue;
    if (spec.kind === "toggle") parts.push(`${key}:${value ? "on" : "off"}`);
    else parts.push(`${key}:${String(value)}`);
  }
  return parts.join(",");
}

/**
 * Reads a share-link string back into values. Anything unknown, malformed or
 * out of range is dropped rather than trusted: a hand-edited URL can only
 * ever produce a state the panel could have produced.
 */
export function decodeTweaks<S extends TweakSchema>(
  schema: S,
  raw: string | null | undefined,
): Partial<TweakValues<S>> {
  const out: Record<string, boolean | number | string> = {};
  if (!raw) return out as Partial<TweakValues<S>>;
  for (const part of raw.split(",")) {
    const cut = part.indexOf(":");
    if (cut <= 0) continue;
    const key = part.slice(0, cut);
    const text = decodeURIComponent(part.slice(cut + 1));
    const spec = schema[key];
    if (!spec) continue;
    if (spec.kind === "toggle") {
      if (text === "on") out[key] = true;
      else if (text === "off") out[key] = false;
    } else if (spec.kind === "range") {
      const n = Number(text);
      if (Number.isFinite(n)) out[key] = snapToStep(spec, n);
    } else if (spec.options.includes(text)) {
      out[key] = text;
    }
  }
  return out as Partial<TweakValues<S>>;
}

/**
 * The JSX a reader would write for the current values: only props that
 * differ from their defaults, strings quoted, booleans and numbers braced,
 * a bare `prop` for `true`. One line when it fits, one prop per line when not.
 */
export function toJsx<S extends TweakSchema>(
  exportName: string,
  schema: S,
  values: Partial<TweakValues<S>>,
  extra: readonly string[] = [],
): string {
  const props: string[] = [...extra];
  for (const [key, spec] of Object.entries(schema)) {
    const value = (values as Record<string, unknown>)[key];
    if (value === undefined || value === spec.default) continue;
    if (value === true) props.push(key);
    else if (typeof value === "string") props.push(`${key}="${value}"`);
    else props.push(`${key}={${String(value)}}`);
  }
  if (props.length === 0) return `<${exportName} />`;
  const inline = `<${exportName} ${props.join(" ")} />`;
  if (inline.length <= 72) return inline;
  return `<${exportName}\n${props.map((p) => `  ${p}`).join("\n")}\n/>`;
}

/** The label a panel prints for a value: "On", "240 ms", "Tumbler". */
export function formatTweak(
  spec: TweakSpec,
  value: boolean | number | string,
): string {
  if (spec.kind === "toggle") return value ? "On" : "Off";
  if (spec.kind === "range") {
    const decimals = (String(spec.step).split(".")[1] ?? "").length;
    const n = Number(value).toFixed(decimals);
    return spec.unit ? `${n} ${spec.unit}` : n;
  }
  const text = String(value);
  return spec.names?.[text] ?? text.charAt(0).toUpperCase() + text.slice(1);
}
