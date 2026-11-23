/**
 * Scroll-in reveals for the page DOM — IntersectionObserver + a CSS class,
 * replacing the film era's scrubbed GSAP tweens. One-shot by design (pages
 * are documents now, not a timeline): once revealed, an element stays.
 * Reduced motion never waits — the stylesheet's reduce block forces every
 * .reveal visible regardless of the .on class.
 */
export function initReveals(root: HTMLElement): () => void {
  const targets = root.querySelectorAll<HTMLElement>(".reveal");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    targets.forEach((el) => {
      el.classList.add("on");
    });
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("on");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -36px 0px" },
  );
  targets.forEach((el) => {
    io.observe(el);
  });
  return () => {
    io.disconnect();
  };
}
