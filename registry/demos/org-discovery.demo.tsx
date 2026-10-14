"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultOrgLookup,
  OrgDiscovery,
  type OrgApproval,
  type OrgDiscoveryStatus,
  type OrgLookup,
  type OrgLookupResult,
} from "@/registry/ui/org-discovery";

export const tweaks = defineTweaks({
  cardStyle: {
    kind: "choice",
    label: "Card",
    default: "card",
    options: ["card", "inline"],
    names: { card: "Raised", inline: "Inline" },
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
    default: "cobalt",
    options: ["cobalt", "signal", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", ink: "Ink" },
  },
});

/**
 * Step two of signing up for Gaugeworks: type an address at fieldline.co
 * and the Fieldline card rises with fourteen teammates already inside; a
 * personal address offers a new organisation instead.
 */
export function OrgDiscoveryDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [email, setEmail] = React.useState("");
  const [found, setFound] = React.useState<string>("nothing yet");
  const [approval, setApproval] = React.useState<OrgApproval>("pending");
  const [requested, setRequested] = React.useState(false);
  const [status, setStatus] = React.useState<OrgDiscoveryStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [seq, setSeq] = React.useState(0);
  const failRef = React.useRef(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  // The next lookup fails once when the switch is on, then the switch resets.
  const lookup = React.useCallback<OrgLookup>((domain) => {
    if (failRef.current) {
      failRef.current = false;
      setFailNext(false);
      return new Promise<OrgLookupResult>((_, reject) => {
        setTimeout(() => reject(new Error("lookup failed")), 600);
      });
    }
    return defaultOrgLookup(domain);
  }, []);

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus("ready");
    }, 900);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    failRef.current = false;
    setEmail("");
    setFound("nothing yet");
    setApproval("pending");
    setRequested(false);
    setStatus("ready");
    setFailNext(false);
    setSeq((n) => n + 1);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <OrgDiscovery height={540} {...values} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <OrgDiscovery
        key={seq}
        height={540}
        value={email}
        onChange={(next) => {
          setEmail(next);
          setRequested(false);
          setApproval("pending");
        }}
        lookup={lookup}
        onDiscover={(result, domain) =>
          setFound(
            result.kind === "found"
              ? `${result.org.name} at ${domain}`
              : result.kind === "personal"
                ? `${domain} is personal`
                : `${domain} is unknown`,
          )
        }
        onJoin={(request) => {
          setRequested(request.via === "request");
          setApproval("pending");
        }}
        onCreate={(request) => setFound(`${request.name} created`)}
        approval={approval}
        status={status}
        onRetry={reload}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {status === "ready"
              ? found
              : status === "loading"
                ? "loading"
                : "load failed"}
          </span>
          {requested ? ` · request ${approval}` : ""}
          {failNext ? " · next lookup fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setApproval("approved")}
            aria-disabled={!requested || approval !== "pending" || undefined}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-default aria-disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => setApproval("declined")}
            aria-disabled={!requested || approval !== "pending" || undefined}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-default aria-disabled:opacity-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => {
              failRef.current = !failRef.current;
              setFailNext(failRef.current);
            }}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            Fail next lookup
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
