"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultOrgDiscoveryOrgs,
  OrgDiscovery,
  type OrgDiscoveryOrg,
} from "@/registry/ui/org-discovery";

export const tweaks = defineTweaks({
  badgeStyle: {
    kind: "choice",
    label: "Badge",
    default: "chip",
    options: ["chip", "tag", "mark"],
    names: { chip: "Chip", tag: "Tag", mark: "Mark" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const ADDRESS = "mara@basinworks.io";

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Waylight's sign-in. When it comes into view the demo types a Basinworks
 * address a letter at a time — unless the visitor has already touched the
 * field — so the domain lifts into its badge on its own. Coldbrook allows
 * passwords too, fernmail.com is unknown, and the first gaugeworks.dev
 * lookup fails so the quiet fallback shows.
 */
export function OrgDiscoveryDemo({
  chrome = true,
  // The sign-in is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [email, setEmail] = React.useState("");
  const [org, setOrg] = React.useState<OrgDiscoveryOrg | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [typing, setTyping] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const touched = React.useRef(false);
  const failedOnce = React.useRef(new Set<string>());

  // Types the address once the form is on screen; a visitor's own hand on
  // the field stops it at once.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let timer = 0;
    let i = 0;
    const tick = () => {
      if (touched.current) {
        setTyping(false);
        return;
      }
      i += 1;
      setEmail(ADDRESS.slice(0, i));
      if (i < ADDRESS.length) timer = window.setTimeout(tick, 75);
      else setTyping(false);
    };
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      timer = window.setTimeout(() => {
        if (touched.current) return;
        setTyping(true);
        tick();
      }, 700);
    });
    io.observe(root);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [round]);

  const replay = () => {
    touched.current = false;
    failedOnce.current.clear();
    setEmail("");
    setOrg(null);
    setNote(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <div
      ref={rootRef}
      className="w-full"
      onPointerDownCapture={() => {
        touched.current = true;
      }}
      onKeyDownCapture={() => {
        touched.current = true;
      }}
    >
      <OrgDiscovery
        key={round}
        value={email}
        onValueChange={(next) => {
          setEmail(next);
          setNote(null);
        }}
        onOrgChange={setOrg}
        lookup={async (domain) => {
          await wait(320);
          if (domain === "gaugeworks.dev" && !failedOnce.current.has(domain)) {
            failedOnce.current.add(domain);
            throw new Error("Lookup service unavailable");
          }
          return (
            defaultOrgDiscoveryOrgs.find((o) => o.domains.includes(domain)) ??
            null
          );
        }}
        onContinue={async (details) => {
          setNote(
            details.method === "sso" && details.org
              ? `opening ${details.org.provider ?? details.org.name}`
              : "signing in",
          );
          await wait(900);
          if (
            details.method === "password" &&
            (details.password ?? "").length < 8
          ) {
            setNote("password refused · step kept");
            throw new Error(
              "That password didn’t match. Try again, or use a code.",
            );
          }
          setNote(
            details.method === "sso" ? "handed to single sign-on" : "signed in",
          );
        }}
        onUseOtherMethod={(method) =>
          setNote(method === "code" ? "code sent" : "password instead")
        }
        onForgotPassword={() => setNote("reset link")}
        onCreateAccount={() => setNote("create account")}
        {...values}
      />
    </div>
  );

  if (!chrome) return surface;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const domain = email.includes("@") ? email.split("@").pop() : "";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={replay} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
        </button>
        <span className="text-[11px] text-ink-3">
          Try coldbrook.co, gaugeworks.dev or fernmail.com
        </span>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <>
            <span className="text-signal">{note}</span>
            {org ? ` · ${org.name}` : ""}
          </>
        ) : typing ? (
          <>
            <span className="text-signal">typing…</span> · {email || "—"}
          </>
        ) : org ? (
          <>
            <span className="text-signal">{org.name} found</span> · single
            sign-on
          </>
        ) : domain ? (
          <>
            <span className="text-signal">no company sign-in</span> · password
            or code
          </>
        ) : (
          <>
            <span className="text-signal">waiting for an address</span> · type
            your work email
          </>
        )}
      </p>
    </div>
  );
}
