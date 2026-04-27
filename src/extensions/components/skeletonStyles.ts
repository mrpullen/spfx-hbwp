/**
 * Injects a small shared CSS rule for the skeleton placeholder used by web
 * components like <hbwp-like> and <hbwp-rating>.
 *
 * The animation aligns with Fluent UI v9's `Skeleton` look-and-feel:
 *  - Low-contrast neutral base (`neutralBackground4` ~ #f0f0f0)
 *  - Slower, gentler wave (3s linear, 80% width band)
 *  - Subtle highlight (`neutralBackground6` ~ #fafafa) — no harsh shimmer
 *  - Reduced motion: respects prefers-reduced-motion
 *
 * Idempotent — only the first call adds the <style> element.
 */
const STYLE_ID = 'hbwp-skeleton-styles';

export function ensureSkeletonStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@keyframes hbwp-skeleton-wave {
  0%   { background-position: 100% 50%; }
  100% { background-position: -100% 50%; }
}
.hbwp-skeleton {
  display: inline-block;
  background-color: var(--colorNeutralBackground4, #f0f0f0);
  background-image: linear-gradient(
    90deg,
    transparent 0%,
    var(--colorNeutralBackground6, #fafafa) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  background-repeat: no-repeat;
  background-position: 100% 50%;
  animation: hbwp-skeleton-wave 3s linear infinite;
  border-radius: 4px;
}
@media (prefers-reduced-motion: reduce) {
  .hbwp-skeleton { animation: none; }
}
`;
  document.head.appendChild(style);
}
