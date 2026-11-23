import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";

import { ABOUT, DOMAINS, FORM, OFFERS, OFFERS_PAGE, REQUESTS_PAGE, STATS } from "../content";
import { useLocale } from "../locale";
import type { Locale } from "../locale";
import { Counter } from "../ui/Counter";
import { emailOk, Field, mailtoHref, makeRef } from "../ui/FormBits";
import { initReveals } from "../ui/reveal";

/**
 * Requests, Offers & About — three clearly separated sections: the company
 * story grounded in the profile's own figures, packages assembled from the
 * platform's REAL solutions (no invented prices — quotes go through the
 * form), and the commercial request form with the same validate → ref →
 * mailto contract as the support ticket.
 */

interface RequestState {
  readonly type: string;
  readonly company: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly fleet: string;
  readonly domain: string;
  readonly details: string;
}

const EMPTY_REQUEST: RequestState = {
  type: "0",
  company: "",
  name: "",
  email: "",
  phone: "",
  fleet: "",
  domain: "",
  details: "",
};

function RequestForm({ l }: { l: Locale }): JSX.Element {
  const [form, setForm] = useState<RequestState>(EMPTY_REQUEST);
  const [errors, setErrors] = useState<Partial<Record<keyof RequestState, string>>>({});
  const [done, setDone] = useState<{ ref: string; mailto: string } | null>(null);

  const set = (key: keyof RequestState, value: string): void => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = (): void => {
    const next: Partial<Record<keyof RequestState, string>> = {};
    if (form.company.trim() === "") next.company = FORM.required[l];
    if (form.name.trim() === "") next.name = FORM.required[l];
    if (form.email.trim() === "") next.email = FORM.required[l];
    else if (!emailOk(form.email)) next.email = FORM.badEmail[l];
    if (form.fleet === "") next.fleet = FORM.required[l];
    if (form.domain === "") next.domain = FORM.required[l];
    if (form.details.trim() === "") next.details = FORM.required[l];
    setErrors(next);
    const firstBad = Object.keys(next).find((k) => next[k as keyof RequestState] !== undefined);
    if (firstBad !== undefined) {
      document.getElementById(`rq-${firstBad}`)?.focus();
      return;
    }

    const ref = makeRef();
    const type = REQUESTS_PAGE.types[Number(form.type)];
    const domain = DOMAINS[Number(form.domain) - 1];
    setDone({
      ref,
      mailto: mailtoHref(`[${ref}] ${type?.en ?? "Request"} — ${form.company.trim()}`, [
        `REF: ${ref}`,
        `Type: ${type?.en ?? ""} / ${type?.ar ?? ""}`,
        `Company: ${form.company.trim()}`,
        `Name: ${form.name.trim()}`,
        `Email: ${form.email.trim()}`,
        form.phone.trim() === "" ? "" : `Phone: ${form.phone.trim()}`,
        `Fleet / units: ${REQUESTS_PAGE.fleetSizes[Number(form.fleet) - 1] ?? ""}`,
        `Domain: ${domain?.name.en ?? ""}`,
        "",
        form.details.trim(),
      ].filter((line) => line !== "")),
    });
  };

  if (done !== null) {
    return (
      <div className="confirm" role="status" aria-live="polite">
        <p className="confirm-title">{FORM.confirmRequestTitle[l]}</p>
        <p className="mono confirm-ref" dir="ltr">
          {FORM.refLabel} · {done.ref}
        </p>
        <p className="confirm-body">{FORM.confirmBody[l]}</p>
        <div className="cta-row">
          <a className="btn primary" href={done.mailto}>
            {FORM.mailCta[l]}
          </a>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDone(null);
              setForm(EMPTY_REQUEST);
            }}
          >
            {FORM.resetRequest[l]}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="form-grid">
        <Field id="rq-type" label={REQUESTS_PAGE.typeLabel[l]} error={errors.type}>
          <select
            id="rq-type"
            value={form.type}
            onChange={(e) => {
              set("type", e.target.value);
            }}
          >
            {REQUESTS_PAGE.types.map((t, i) => (
              <option key={t.en} value={String(i)}>
                {t[l]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="rq-company" label={FORM.company[l]} error={errors.company}>
          <input
            id="rq-company"
            type="text"
            autoComplete="organization"
            value={form.company}
            aria-invalid={errors.company !== undefined}
            aria-describedby={errors.company !== undefined ? "rq-company-error" : undefined}
            onChange={(e) => {
              set("company", e.target.value);
            }}
          />
        </Field>
        <Field id="rq-name" label={FORM.name[l]} error={errors.name}>
          <input
            id="rq-name"
            type="text"
            autoComplete="name"
            value={form.name}
            aria-invalid={errors.name !== undefined}
            aria-describedby={errors.name !== undefined ? "rq-name-error" : undefined}
            onChange={(e) => {
              set("name", e.target.value);
            }}
          />
        </Field>
        <Field id="rq-email" label={FORM.email[l]} error={errors.email}>
          <input
            id="rq-email"
            type="email"
            dir="ltr"
            autoComplete="email"
            value={form.email}
            aria-invalid={errors.email !== undefined}
            aria-describedby={errors.email !== undefined ? "rq-email-error" : undefined}
            onChange={(e) => {
              set("email", e.target.value);
            }}
          />
        </Field>
        <Field id="rq-phone" label={FORM.phone[l]} error={errors.phone}>
          <input
            id="rq-phone"
            type="tel"
            dir="ltr"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => {
              set("phone", e.target.value);
            }}
          />
        </Field>
        <Field id="rq-fleet" label={REQUESTS_PAGE.fleetLabel[l]} error={errors.fleet}>
          <select
            id="rq-fleet"
            value={form.fleet}
            aria-invalid={errors.fleet !== undefined}
            aria-describedby={errors.fleet !== undefined ? "rq-fleet-error" : undefined}
            onChange={(e) => {
              set("fleet", e.target.value);
            }}
          >
            <option value="">{FORM.select[l]}</option>
            {REQUESTS_PAGE.fleetSizes.map((size, i) => (
              <option key={size} value={String(i + 1)}>
                {size}
              </option>
            ))}
          </select>
        </Field>
        <Field id="rq-domain" label={REQUESTS_PAGE.domainLabel[l]} error={errors.domain}>
          <select
            id="rq-domain"
            value={form.domain}
            aria-invalid={errors.domain !== undefined}
            aria-describedby={errors.domain !== undefined ? "rq-domain-error" : undefined}
            onChange={(e) => {
              set("domain", e.target.value);
            }}
          >
            <option value="">{FORM.select[l]}</option>
            {DOMAINS.map((d, i) => (
              <option key={d.tag} value={String(i + 1)}>
                {d.name[l]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="rq-details" label={REQUESTS_PAGE.detailsLabel[l]} error={errors.details}>
        <textarea
          id="rq-details"
          rows={5}
          placeholder={REQUESTS_PAGE.detailsPlaceholder[l]}
          value={form.details}
          aria-invalid={errors.details !== undefined}
          aria-describedby={errors.details !== undefined ? "rq-details-error" : undefined}
          onChange={(e) => {
            set("details", e.target.value);
          }}
        />
      </Field>
      <button type="submit" className="btn primary">
        {FORM.submitRequest[l]}
      </button>
    </form>
  );
}

export function RequestsPage(): JSX.Element {
  const l = useLocale();
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = root.current;
    return el === null ? undefined : initReveals(el);
  }, []);

  const scrollToForm = (): void => {
    document.getElementById("request-form")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  };

  return (
    <div className="page page-doc" ref={root}>
      {/* ── About us ───────────────────────────────────────────────────── */}
      <header className="page-head">
        <p className="kicker mono reveal">{ABOUT.kicker}</p>
        <h2 className="reveal">{ABOUT.h2[l]}</h2>
        <p className="lead reveal">{ABOUT.mission[l]}</p>
        <p className="lead reveal">{ABOUT.body[l]}</p>
      </header>

      <section className="doc-section">
        <h3 className="section-title reveal">{ABOUT.capsTitle[l]}</h3>
        <div className="stats reveal">
          {STATS.map((stat) => (
            <Counter key={stat.tag} value={stat.value} suffix={stat.suffix} en={stat.tag} ar={stat.label[l]} />
          ))}
        </div>
        <h3 className="section-title reveal" style={{ marginTop: 26 }}>
          {ABOUT.domainsTitle[l]}
        </h3>
        <div className="chips reveal">
          {DOMAINS.map((d) => (
            <span className="chip" key={d.tag}>
              {d.name[l]} · {String(d.count).padStart(2, "0")}
            </span>
          ))}
        </div>
      </section>

      {/* ── Offers ─────────────────────────────────────────────────────── */}
      <section className="doc-section">
        <p className="kicker mono reveal">{OFFERS_PAGE.kicker}</p>
        <h2 className="reveal">{OFFERS_PAGE.h2[l]}</h2>
        <p className="lead reveal">{OFFERS_PAGE.lead[l]}</p>
        <div className="offers reveal">
          {OFFERS.map((offer) => (
            <article className="offer glass-card" key={offer.tag}>
              <p className="mono offer-tag" dir="ltr">
                {offer.tag}
              </p>
              <h3 className="offer-name">{offer.name[l]}</h3>
              <p className="offer-desc">{offer.desc[l]}</p>
              <ul className="offer-list">
                {offer.features.map((f) => (
                  <li key={f.en}>{f[l]}</li>
                ))}
              </ul>
              <button type="button" className="btn primary" onClick={scrollToForm}>
                {OFFERS_PAGE.cta[l]}
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* ── Request form ───────────────────────────────────────────────── */}
      <section className="doc-section" id="request-form">
        <div className="form-card glass-card reveal">
          <p className="kicker mono">{REQUESTS_PAGE.kicker}</p>
          <h3 className="section-title">{REQUESTS_PAGE.h2[l]}</h3>
          <p className="lead" style={{ marginTop: 4 }}>
            {REQUESTS_PAGE.lead[l]}
          </p>
          <RequestForm l={l} />
        </div>
      </section>
    </div>
  );
}
