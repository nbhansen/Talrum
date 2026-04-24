import type { JSX } from 'react';

/**
 * Small-size Talrum mark — the wordmark-free version of the brand logo for
 * places where the PNG would be too pixelated to read (sidebar, kid-mode
 * top bar). Scales crisply at any size via SVG.
 *
 * The full brand PNG lives at src/assets/talrum-logo.png and is used where
 * the wordmark is visible and readable (favicon fallback, marketing surfaces).
 */
interface TalrumMarkProps {
  size?: number;
}

export const TalrumMark = ({ size = 44 }: TalrumMarkProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    role="img"
    aria-label="Talrum"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="0" y="0" width="100" height="100" rx="20" fill="#7cb8e0" />
    <rect
      x="7"
      y="7"
      width="86"
      height="86"
      rx="14"
      fill="none"
      stroke="#ffffff"
      strokeWidth="2.5"
    />
    <path d="M 22 42 L 22 58 L 34 58 L 50 72 L 50 28 L 34 42 Z" fill="#ffffff" />
    <path
      d="M 56 36 Q 66 50 56 64"
      fill="none"
      stroke="#ffffff"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <path
      d="M 64 30 Q 78 50 64 70"
      fill="none"
      stroke="#ffffff"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <path
      d="M 72 25 Q 88 50 72 75"
      fill="none"
      stroke="#ffffff"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);
