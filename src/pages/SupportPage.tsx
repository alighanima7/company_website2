import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";

import {
  CONTACT,
  FAQS,
  FORM,
  SUPPORT_PAGE,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  VISIBLE_PRODUCTS,
} from "../content";
import { useLocale } from "../locale";
import type { Locale } from "../locale";
import { emailOk, Field, mailtoHref, makeRef } from "../ui/FormBits";
import { initReveals } from "../ui/reveal";

/**
 * Technical Support — direct channels, FAQs (native <details>, keyboard
 * accessible for free), and the ticket form. Validation is inline and
 * bilingual; a valid submission mints a reference and prefills an email
 * to the support inbox (the confirmation copy says exactly that — the
 * mail IS the transport in this build).
 */

interface TicketState {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly product: string;
  readonly category: string;
  readonly priority: string;
  readonly message: string;
}

const EMPTY_TICKET: TicketState = {
  name: "",
  email: "",
  phone: "",
  product: "",
  category: "",
  priority: "1",
  message: "",
};

function TicketForm({ l }: { l: Locale }): JSX.Element {
  const [form, setForm] = useState<TicketState>(EMPTY_TICKET);
  const [errors, setErrors] = useState<Partial<Record<keyof TicketState, string>>>({});
  const [done, setDone] = useState<{ ref: string; mailto: string } | null>(null);

  const set = (key: keyof TicketState, value: string): void => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = (): void => {
    const next: Partial<Record<keyof TicketState, string>> = {};
    if (form.name.trim() === "") next.name = FORM.required[l];
    if (form.email.trim() === "") next.email = FORM.required[l];
    else if (!emailOk(form.email)) next.email = FORM.badEmail[l];
    if (form.product === "") next.product = FORM.required[l];
    if (form.category === "") next.category = FORM.required[l];
    if (form.message.trim() === "") next.message = FORM.required[l];
    setErrors(next);
    const firstBad = Object.keys(next).find((k) => next[k as keyof TicketState] !== undefined);
    if (firstBad !== undefined) {
      document.getElementById(`tk-${firstBad}`)?.focus();
      return;
    }

    const ref = makeRef();
    const productLabel =
      form.product === "other"
        ? FORM.otherProduct.en
        : VISIBLE_PRODUCTS.find((p) => p.id === form.product)?.name.en ?? form.product;
    const category = TICKET_CATEGORIES[Number(form.category) - 1];
    const priority = TICKET_PRIORITIES[Number(form.priority)];
    setDone({
      ref,
      mailto: mailtoHref(`[${ref}] Support ticket — ${productLabel}`, [
        `REF: ${ref}`,
        `Name: ${form.name.trim()}`,
        `Email: ${form.email.trim()}`,
        form.phone.trim() === "" ? "" : `Phone: ${form.phone.trim()}`,
        `Product: ${productLabel}`,
        `Category: ${category?.en ?? ""} / ${category?.ar ?? ""}`,
        `Priority: ${priority?.en ?? ""}`,
        "",
        form.message.trim(),
      ].filter((line) => line !== "")),
    });
  };

  if (done !== null) {
    return (
      <div className="confirm" role="status" aria-live="polite">
        <p className="confirm-title">{FORM.confirmTicketTitle[l]}</p>
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
              setForm(EMPTY_TICKET);
            }}
          >
            {FORM.resetTicket[l]}
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
        <Field id="tk-name" label={FORM.name[l]} error={errors.name}>
          <input
            id="tk-name"
            type="text"
            autoComplete="name"
            value={form.name}
            aria-invalid={errors.name !== undefined}
            aria-describedby={errors.name !== undefined ? "tk-name-error" : undefined}
            onChange={(e) => {
              set("name", e.target.value);
            }}
          />
        </Field>
        <Field id="tk-email" label={FORM.email[l]} error={errors.email}>
          <input
            id="tk-email"
            type="email"
            dir="ltr"
            autoComplete="email"
            value={form.email}
            aria-invalid={errors.email !== undefined}
            aria-describedby={errors.email !== undefined ? "tk-email-error" : undefined}
            onChange={(e) => {
              set("email", e.target.value);
            }}
          />
        </Field>
        <Field id="tk-phone" label={FORM.phone[l]} error={errors.phone}>
          <input
            id="tk-phone"
            type="tel"
            dir="ltr"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => {
              set("phone", e.target.value);
            }}
          />
        </Field>
        <Field id="tk-product" label={FORM.product[l]} error={errors.product}>
          <select
            id="tk-product"
            value={form.product}
            aria-invalid={errors.product !== undefined}
            aria-describedby={errors.product !== undefined ? "tk-product-error" : undefined}
            onChange={(e) => {
              set("product", e.target.value);
            }}
          >
            <option value="">{FORM.select[l]}</option>
            {/* Hidden products are not offered on the ticket form. */}
            {VISIBLE_PRODUCTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name[l]}
              </option>
            ))}
            <option value="other">{FORM.otherProduct[l]}</option>
          </select>
        </Field>
        <Field id="tk-category" label={FORM.category[l]} error={errors.category}>
          <select
            id="tk-category"
            value={form.category}
            aria-invalid={errors.category !== undefined}
            aria-describedby={errors.category !== undefined ? "tk-category-error" : undefined}
            onChange={(e) => {
              set("category", e.target.value);
            }}
          >
            <option value="">{FORM.select[l]}</option>
            {TICKET_CATEGORIES.map((c, i) => (
              <option key={c.en} value={String(i + 1)}>
                {c[l]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="tk-priority" label={FORM.priority[l]} error={errors.priority}>
          <select
            id="tk-priority"
            value={form.priority}
            onChange={(e) => {
              set("priority", e.target.value);
            }}
          >
            {TICKET_PRIORITIES.map((p, i) => (
              <option key={p.en} value={String(i)}>
                {p[l]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="tk-message" label={FORM.message[l]} error={errors.message}>
        <textarea
          id="tk-message"
          rows={5}
          placeholder={FORM.messagePlaceholder[l]}
          value={form.message}
          aria-invalid={errors.message !== undefined}
          aria-describedby={errors.message !== undefined ? "tk-message-error" : undefined}
          onChange={(e) => {
            set("message", e.target.value);
          }}
        />
      </Field>
      <button type="submit" className="btn primary">
        {FORM.submitTicket[l]}
      </button>
    </form>
  );
}

export function SupportPage(): JSX.Element {
  const l = useLocale();
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = root.current;
    return el === null ? undefined : initReveals(el);
  }, []);

  return (
    <div className="page page-doc" ref={root}>
      <header className="page-head">
        <p className="kicker mono reveal">{SUPPORT_PAGE.kicker}</p>
        <h2 className="reveal">{SUPPORT_PAGE.h2[l]}</h2>
        <p className="lead reveal">{SUPPORT_PAGE.lead[l]}</p>
      </header>

      {/* Direct channels */}
      <section className="doc-section">
        <h3 className="section-title reveal">{SUPPORT_PAGE.channelsTitle[l]}</h3>
        <div className="contact reveal">
          <a href={`tel:${CONTACT.phone}`} className="contact-item">
            <span className="mono" dir="ltr">
              {CONTACT.phone}
            </span>
            <span>{CONTACT.labels.call[l]}</span>
          </a>
          <a href={`mailto:${CONTACT.email}`} className="contact-item">
            <span className="mono" dir="ltr">
              {CONTACT.email}
            </span>
            <span>{CONTACT.labels.mail[l]}</span>
          </a>
          <a href={`https://${CONTACT.site}`} target="_blank" rel="noopener noreferrer" className="contact-item">
            <span className="mono" dir="ltr">
              {CONTACT.site}
            </span>
            <span>{CONTACT.labels.group[l]}</span>
          </a>
        </div>
      </section>

      {/* FAQs */}
      <section className="doc-section">
        <h3 className="section-title reveal">{SUPPORT_PAGE.faqTitle[l]}</h3>
        <div className="faqs reveal">
          {FAQS.map((faq) => (
            <details className="faq" key={faq.q.en}>
              <summary>{faq.q[l]}</summary>
              <p>{faq.a[l]}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Ticket form */}
      <section className="doc-section">
        <div className="form-card glass-card reveal">
          <h3 className="section-title">{SUPPORT_PAGE.formTitle[l]}</h3>
          <p className="lead" style={{ marginTop: 4 }}>
            {SUPPORT_PAGE.formLead[l]}
          </p>
          <TicketForm l={l} />
        </div>
      </section>
    </div>
  );
}
