import type { JSX } from 'react';

import { assertNever } from '@/lib/assertNever';
import type { GlyphName } from '@/types/domain';

/**
 * Pictogram glyph — a tiny shape drawn on a 100×100 viewBox using nothing but
 * circles, rects, lines, ellipses, and paths. Stroke + fill come from CSS
 * variables so a single theme change re-skins every glyph at once.
 *
 * The `check` glyph is the one exception — it uses a sage-tier color pair
 * directly, per the prototype. Same reason: it doubles as a "completion"
 * badge and reads more naturally in green.
 */

interface GlyphProps {
  name: GlyphName;
  size?: number;
}

const STROKE_VAR = 'var(--tal-glyph-stroke)';
const FILL_VAR = 'var(--tal-glyph-fill)';
const CHECK_BG = 'oklch(86% 0.06 155)';
const CHECK_INK = 'oklch(42% 0.06 155)';

export const Glyph = ({ name, size = 80 }: GlyphProps): JSX.Element => {
  const sw = Math.max(2.5, size * 0.04);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: 'block' }}>
      <GlyphShape name={name} strokeWidth={sw} />
    </svg>
  );
};

interface ShapeProps {
  name: GlyphName;
  strokeWidth: number;
}

const GlyphShape = ({ name, strokeWidth }: ShapeProps): JSX.Element => {
  const common = {
    fill: 'none',
    stroke: STROKE_VAR,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;

  switch (name) {
    case 'bed':
      return (
        <g {...common}>
          <rect x="18" y="45" width="64" height="28" rx="6" fill={FILL_VAR} />
          <rect x="26" y="35" width="20" height="14" rx="4" fill={FILL_VAR} />
          <line x1="18" y1="73" x2="18" y2="82" />
          <line x1="82" y1="73" x2="82" y2="82" />
        </g>
      );
    case 'shirt':
      return (
        <g {...common}>
          <path
            d="M30 30 L20 40 L28 50 L32 45 L32 78 L68 78 L68 45 L72 50 L80 40 L70 30 L60 30 Q50 42 40 30 Z"
            fill={FILL_VAR}
          />
        </g>
      );
    case 'bowl':
      return (
        <g {...common}>
          <ellipse cx="50" cy="50" rx="34" ry="8" fill={FILL_VAR} />
          <path d="M16 50 Q20 78 50 78 Q80 78 84 50" fill={FILL_VAR} />
          <circle cx="42" cy="48" r="2" fill={STROKE_VAR} />
          <circle cx="58" cy="48" r="2" fill={STROKE_VAR} />
          <circle cx="50" cy="52" r="2" fill={STROKE_VAR} />
        </g>
      );
    case 'car':
      return (
        <g {...common}>
          <path d="M14 60 L22 42 L78 42 L86 60 L86 70 L14 70 Z" fill={FILL_VAR} />
          <line x1="30" y1="42" x2="34" y2="54" />
          <line x1="70" y1="42" x2="66" y2="54" />
          <line x1="14" y1="54" x2="86" y2="54" />
          <circle cx="30" cy="72" r="6" fill={FILL_VAR} />
          <circle cx="70" cy="72" r="6" fill={FILL_VAR} />
        </g>
      );
    case 'tooth':
      return (
        <g {...common}>
          <path
            d="M30 28 Q50 22 70 28 Q74 48 66 66 Q62 74 58 68 Q54 54 50 54 Q46 54 42 68 Q38 74 34 66 Q26 48 30 28 Z"
            fill={FILL_VAR}
          />
        </g>
      );
    case 'sun':
      return (
        <g {...common}>
          <circle cx="50" cy="50" r="16" fill={FILL_VAR} />
          <line x1="50" y1="20" x2="50" y2="28" />
          <line x1="50" y1="72" x2="50" y2="80" />
          <line x1="20" y1="50" x2="28" y2="50" />
          <line x1="72" y1="50" x2="80" y2="50" />
          <line x1="28" y1="28" x2="34" y2="34" />
          <line x1="66" y1="66" x2="72" y2="72" />
          <line x1="72" y1="28" x2="66" y2="34" />
          <line x1="28" y1="72" x2="34" y2="66" />
        </g>
      );
    case 'bag':
      return (
        <g {...common}>
          <rect x="22" y="38" width="56" height="44" rx="5" fill={FILL_VAR} />
          <path d="M36 38 Q36 22 50 22 Q64 22 64 38" />
        </g>
      );
    case 'brush':
      return (
        <g {...common}>
          <rect x="44" y="18" width="12" height="36" rx="3" fill={FILL_VAR} />
          <rect x="40" y="54" width="20" height="30" rx="4" fill={FILL_VAR} />
          <line x1="45" y1="62" x2="45" y2="78" />
          <line x1="50" y1="62" x2="50" y2="78" />
          <line x1="55" y1="62" x2="55" y2="78" />
        </g>
      );
    case 'apple':
      return (
        <g {...common}>
          <path
            d="M50 36 Q30 30 26 50 Q26 72 40 80 Q50 84 60 80 Q74 72 74 50 Q70 30 50 36 Z"
            fill={FILL_VAR}
          />
          <path d="M50 36 Q52 22 62 18" />
        </g>
      );
    case 'cup':
      return (
        <g {...common}>
          <path d="M26 32 L30 82 L70 82 L74 32 Z" fill={FILL_VAR} />
          <line x1="28" y1="42" x2="72" y2="42" />
          <path d="M74 42 Q86 46 82 62 Q78 70 70 68" />
        </g>
      );
    case 'shoe':
      return (
        <g {...common}>
          <path
            d="M16 60 L20 44 L36 44 L44 54 L72 54 Q84 54 84 66 L84 72 L16 72 Z"
            fill={FILL_VAR}
          />
          <line x1="36" y1="44" x2="40" y2="54" />
          <line x1="52" y1="54" x2="54" y2="62" />
          <line x1="62" y1="54" x2="64" y2="62" />
        </g>
      );
    case 'park':
      return (
        <g {...common}>
          <line x1="14" y1="76" x2="86" y2="76" />
          <circle cx="32" cy="44" r="12" fill={FILL_VAR} />
          <line x1="32" y1="56" x2="32" y2="76" />
          <path d="M62 76 L62 46 L78 46 L78 40 L62 40" fill={FILL_VAR} />
          <line x1="62" y1="54" x2="78" y2="54" />
        </g>
      );
    case 'store':
      return (
        <g {...common}>
          <rect x="18" y="40" width="64" height="38" rx="3" fill={FILL_VAR} />
          <path d="M18 40 L26 28 L74 28 L82 40" />
          <rect x="40" y="54" width="20" height="24" fill={FILL_VAR} />
        </g>
      );
    case 'zoo':
      return (
        <g {...common}>
          <circle cx="50" cy="54" r="22" fill={FILL_VAR} />
          <circle cx="36" cy="38" r="7" fill={FILL_VAR} />
          <circle cx="64" cy="38" r="7" fill={FILL_VAR} />
          <circle cx="44" cy="52" r="2" fill={STROKE_VAR} />
          <circle cx="56" cy="52" r="2" fill={STROKE_VAR} />
          <ellipse cx="50" cy="62" rx="4" ry="3" fill={FILL_VAR} />
        </g>
      );
    case 'play':
      return (
        <g {...common}>
          <circle cx="50" cy="50" r="30" fill={FILL_VAR} />
          <path d="M44 38 L62 50 L44 62 Z" fill={STROKE_VAR} />
        </g>
      );
    case 'book':
      return (
        <g {...common}>
          <path
            d="M20 26 Q35 22 50 28 Q65 22 80 26 L80 74 Q65 70 50 76 Q35 70 20 74 Z"
            fill={FILL_VAR}
          />
          <line x1="50" y1="28" x2="50" y2="76" />
        </g>
      );
    case 'bath':
      return (
        <g {...common}>
          <path d="M16 52 L84 52 L80 74 Q78 80 72 80 L28 80 Q22 80 20 74 Z" fill={FILL_VAR} />
          <line x1="16" y1="52" x2="84" y2="52" />
          <circle cx="30" cy="40" r="4" />
        </g>
      );
    case 'swing':
      return (
        <g {...common}>
          <line x1="20" y1="20" x2="80" y2="20" />
          <line x1="35" y1="20" x2="35" y2="60" />
          <line x1="65" y1="20" x2="65" y2="60" />
          <rect x="30" y="60" width="40" height="8" rx="2" fill={FILL_VAR} />
        </g>
      );
    case 'heart':
      return (
        <g {...common}>
          <path
            d="M50 78 Q20 58 20 40 Q20 26 34 26 Q44 26 50 38 Q56 26 66 26 Q80 26 80 40 Q80 58 50 78 Z"
            fill={FILL_VAR}
          />
        </g>
      );
    case 'check':
      return (
        <g
          fill="none"
          stroke={CHECK_INK}
          strokeWidth={strokeWidth * 1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="50" cy="50" r="34" fill={CHECK_BG} stroke={CHECK_INK} />
          <path d="M34 52 L46 62 L66 40" stroke={CHECK_INK} />
        </g>
      );
    default:
      return assertNever(name);
  }
};
