/**
 * One reduced-motion check for the feedback components. The setting arrives
 * two ways: the in-app switch sets `html[data-reduce-motion]`, and the OS
 * preference shows up through `matchMedia`. Either one means "no animation".
 *
 * CSS is the second guard (ui.css kills animations under the attribute); this
 * check is the first, so a component can skip scheduling the animation at all.
 */
export function prefersReducedMotion(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.hasAttribute("data-reduce-motion")) return true;
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
