import type { JSX } from 'react';

interface PhotoPlaceholderProps {
  label: string;
}

/** Stands in for a photo pictogram with no uploaded image yet. */
export const PhotoPlaceholder = ({ label }: PhotoPlaceholderProps): JSX.Element => (
  <svg
    viewBox="0 0 100 100"
    width="100%"
    height="100%"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <defs>
      <pattern
        id="tal-photo-stripes"
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="6" height="6" fill="var(--tal-photo-stripe-a)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--tal-photo-stripe-b)" strokeWidth="2" />
      </pattern>
    </defs>
    <rect width="100" height="100" fill="url(#tal-photo-stripes)" />
    <text
      x="50"
      y="53"
      textAnchor="middle"
      fontFamily="ui-monospace, monospace"
      fontSize="7"
      fill="var(--tal-ink-muted)"
    >
      photo
    </text>
    <text
      x="50"
      y="63"
      textAnchor="middle"
      fontFamily="ui-monospace, monospace"
      fontSize="5.5"
      fill="var(--tal-ink-muted)"
    >
      {label.toLowerCase()}
    </text>
  </svg>
);
