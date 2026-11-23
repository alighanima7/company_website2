import type { JSX, ReactNode } from "react";

import { CONTACT } from "../content";

/**
 * Shared form plumbing for the Support ticket and the Requests form —
 * a labeled field wrapper with inline validation messaging, plus the
 * submission helpers. There is no backend in this build, so a validated
 * submission produces a reference number and a prefilled mailto: to the
 * company inbox — the email IS the transport, stated plainly in the
 * confirmation copy.
 */

export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={`field${error !== undefined ? " invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error !== undefined && (
        <span className="field-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Human-quotable ticket/request reference, e.g. NNS-M3K9QD. */
export function makeRef(): string {
  return `NNS-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/** mailto: into the company inbox with the composed summary as the body. */
export function mailtoHref(subject: string, lines: readonly string[]): string {
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
