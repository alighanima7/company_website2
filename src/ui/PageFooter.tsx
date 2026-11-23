import type { JSX } from "react";

import { BRAND, CONTACT } from "../content";
import { useLocale } from "../locale";

/** Slim shared footer: brand, address, licenses, direct contacts. */
export function PageFooter(): JSX.Element {
  const l = useLocale();
  return (
    <footer className="site-footer">
      <p className="licenses">
        {BRAND.licenses[0][l]} · {BRAND.licenses[1][l]}
      </p>
      <div className="footer-row">
        <span>
          {l === "ar" ? BRAND.nameAr : BRAND.nameEn} — {CONTACT.address[l]}
        </span>
        <span className="footer-links">
          <a href={`tel:${CONTACT.phone}`} className="mono" dir="ltr">
            {CONTACT.phone}
          </a>
          <a href={`mailto:${CONTACT.email}`} className="mono" dir="ltr">
            {CONTACT.email}
          </a>
        </span>
      </div>
    </footer>
  );
}
