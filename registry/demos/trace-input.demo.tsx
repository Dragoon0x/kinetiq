"use client";

import * as React from "react";

import { CheckCircle2, Wrench } from "lucide-react";

import { TraceInput } from "@/registry/ui/trace-input";

export function TraceInputDemo() {
  const [email, setEmail] = React.useState("");
  const emailValid = /@.+\./.test(email);
  const emailInvalid = email.length > 0 && !emailValid;

  return (
    <form
      className="flex w-full max-w-80 flex-col gap-4"
      onSubmit={(event) => event.preventDefault()}
      aria-label="Register instrument"
    >
      <TraceInput
        label="Instrument name"
        name="instrument"
        prefix={<Wrench className="size-4" />}
        description="As etched on the chassis plate."
        autoComplete="off"
      />
      <TraceInput
        label="Operator email"
        name="operator-email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={emailInvalid ? "Enter a valid email address." : undefined}
        description={
          emailValid ? "Operator on file — clear to register." : undefined
        }
        suffix={
          emailValid ? <CheckCircle2 className="text-primary size-4" /> : undefined
        }
        autoComplete="off"
      />
    </form>
  );
}
