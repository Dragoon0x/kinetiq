import type { KinetiqItem } from "./types";

/**
 * Whole page compositions, serials KP-001+. Each one assembles shipped
 * sections and primitives, and ships with a `target` so the CLI knows where
 * to write it.
 *
 * Auth pages are the exception to the compose-from-sections rule: they are
 * app surfaces built from primitives, because the wing has no auth sections
 * and inventing one to serve a single page would be the wrong shape.
 */
export const pages: KinetiqItem[] = [
  {
    name: "auth-sign-in",
    type: "registry:page",
    title: "Sign In Page",
    description:
      "Sign in with the two things most sign-in pages get wrong put right: the workspace route sits above the password rather than behind a second click, and the page says plainly what to do if you have no account instead of leaving the reader to guess whether sign-up exists.",
    files: [
      {
        path: "registry/pages/auth-sign-in/auth-sign-in.tsx",
        type: "registry:page",
        target: "app/(auth)/sign-in/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "trace-input", "pressure-button"],
    categories: ["auth"],
    meta: { serial: "KP-001" },
    tagline: "The workspace route above the password.",
    keywords: ["auth", "sign in", "login", "sso", "page"],
    props: [
      {
        name: "sso / onSso",
        type: "SsoProvider[] · (id) => void",
        description: "Workspace routes, offered before the password.",
      },
      {
        name: "onSubmit",
        type: "(email, password) => void",
        description:
          "Wire it to your own auth; the shell authenticates nothing.",
      },
      {
        name: "noAccountLine",
        type: "string",
        description: "What to do when sign-up is invite-only.",
      },
    ],
    usageNotes: [
      "A shell, not an auth system — never post credentials from a client component without a server action or API route behind it.",
      "Keep SSO above the fold. Hiding it costs every workspace user an extra click on every sign-in.",
      "Say what happens when there is no account; silence there reads as a broken form.",
    ],
  },
  {
    name: "auth-sign-up",
    type: "registry:page",
    title: "Sign Up Page",
    description:
      "Sign up that says what it is about to create before it creates it: the three things this account gets you, the one email that will arrive, and no trial countdown — because a page that hides the terms until after the password has already spent the goodwill it needed.",
    files: [
      {
        path: "registry/pages/auth-sign-up/auth-sign-up.tsx",
        type: "registry:page",
        target: "app/(auth)/sign-up/page.tsx",
      },
    ],
    dependencies: ["lucide-react"],
    registryDependencies: ["utils", "trace-input", "pressure-button"],
    categories: ["auth"],
    meta: { serial: "KP-002" },
    tagline: "State the bargain before the button.",
    keywords: ["auth", "sign up", "register", "onboarding", "page"],
    props: [
      {
        name: "creates",
        type: "string[]",
        description: "Exactly what this account does and does not create.",
      },
      {
        name: "nextLine",
        type: "string",
        description:
          "What lands in the inbox, said before the button is pressed.",
      },
    ],
    usageNotes: [
      "A shell — wire onSubmit to your own auth and never handle credentials client-side.",
      "The side panel is not decoration: it is where the bargain is stated, so it is read before the button rather than discovered after it.",
      "If there is a trial clock, say so here. Discovering one later is what makes people distrust everything else on the page.",
    ],
  },
  {
    name: "auth-recover",
    type: "registry:page",
    title: "Password Recovery Page",
    description:
      "Password recovery that refuses to leak. The response is identical whether or not the address has an account, and — unusually — the page says so out loud, because a reader who does not understand why they got a vague answer assumes the form is broken and tries again.",
    files: [
      {
        path: "registry/pages/auth-recover/auth-recover.tsx",
        type: "registry:page",
        target: "app/(auth)/recover/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: [
      "utils",
      "trace-input",
      "status-seal",
      "pressure-button",
    ],
    categories: ["auth"],
    meta: { serial: "KP-003" },
    tagline: "Identical answer, and it says why.",
    keywords: ["auth", "password reset", "recovery", "forgot", "page"],
    props: [
      {
        name: "privacyNote",
        type: "string",
        description: "Why the response is the same either way.",
      },
      {
        name: "sentHeadline / sentCopy",
        type: "string",
        description:
          'The confirmed state — deliberately never "we found your account".',
      },
    ],
    usageNotes: [
      "Keep the identical response on the server too. A page careful in the UI and chatty in the API has leaked anyway.",
      "Explaining the vagueness is the point — an unexplained non-answer reads as a bug and gets retried.",
      "Never confirm or deny the address exists, including through timing or status codes.",
    ],
  },
  {
    name: "auth-second-factor",
    type: "registry:page",
    title: "Second Factor Page",
    description:
      "The second factor, with the lost-device path given the same weight as the code field. Almost every 2FA screen buries recovery in small grey text at the bottom, which is precisely where nobody looks while holding a dead phone.",
    files: [
      {
        path: "registry/pages/auth-second-factor/auth-second-factor.tsx",
        type: "registry:page",
        target: "app/(auth)/two-factor/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "trace-input", "pressure-button"],
    categories: ["auth"],
    meta: { serial: "KP-004" },
    tagline: "Recovery is not a footnote.",
    keywords: ["auth", "2fa", "two factor", "otp", "page"],
    props: [
      {
        name: "length",
        type: "number",
        description:
          "Digits in the code; drives the pattern and the shape check.",
      },
      {
        name: "recoveryLabel / recoveryCopy / recoveryHref",
        type: "string",
        description: "The lost-device path, at equal weight.",
      },
    ],
    usageNotes: [
      "The shape check is digits and length only. It is not verification and must never be treated as any.",
      'autoComplete="one-time-code" lets phones offer the code — dropping it costs real completions.',
      "Give recovery its own heading and box. Grey small print at the bottom of a 2FA page is unreachable by design.",
    ],
  },
  {
    name: "auth-workspace-pick",
    type: "registry:page",
    title: "Workspace Picker Page",
    description:
      'The workspace picker, which exists because "you are in more than one organisation" is a normal state most products treat as an edge case. Each row carries the role you hold there, and the account you are signed in as is stated at the top — because the commonest cause of an empty list is the wrong account.',
    files: [
      {
        path: "registry/pages/auth-workspace-pick/auth-workspace-pick.tsx",
        type: "registry:page",
        target: "app/(auth)/workspaces/page.tsx",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "status-pip"],
    categories: ["auth"],
    meta: { serial: "KP-005" },
    tagline: "Your role, before you click.",
    keywords: ["auth", "workspace", "organisation", "tenant", "page"],
    props: [
      {
        name: "workspaces",
        type: "Workspace[]",
        description:
          "Name, your role there, yard count, and whether it is live.",
      },
      {
        name: "signedInAs / missingLine",
        type: "string",
        description:
          "Which account this is, and the path when the expected workspace is absent.",
      },
    ],
    usageNotes: [
      "Print the role. Which workspace lets you do the thing you signed in for is the entire question this page answers.",
      "State the signed-in address prominently — the wrong account is the commonest cause of a missing workspace.",
      "Do not auto-forward on a single workspace without saying so; a page that vanishes is a page people cannot get back to.",
    ],
  },
];
