import type { JSX } from "react";

import { setLocale, useLocale } from "../locale";

/**
 * AR ⇄ EN switch — glass chip under the theme toggle, showing the locale it
 * switches TO (instrument-mono). Flipping swaps every string, mirrors the
 * layout via <html dir>, and the locale store re-syncs the scroll phases.
 */
export function LangToggle(): JSX.Element {
  const locale = useLocale();
  const toEnglish = locale === "ar";

  return (
    <button
      type="button"
      className="lang-toggle"
      aria-label={toEnglish ? "التبديل إلى الإنجليزية" : "Switch to Arabic"}
      title={toEnglish ? "English" : "العربية"}
      onClick={() => {
        setLocale(toEnglish ? "en" : "ar");
      }}
    >
      <span className="mono">{toEnglish ? "EN" : "AR"}</span>
    </button>
  );
}
