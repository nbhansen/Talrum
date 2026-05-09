import type { CSSProperties, JSX, ReactNode } from 'react';

/**
 * Every icon defaults to `currentColor` for stroke/fill so the parent can
 * theme via a CSS class on the surrounding element.
 */

export interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

interface RawSvgProps extends IconProps {
  viewBox: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  children: ReactNode;
}

const Svg = ({
  size = 20,
  viewBox,
  fill = 'none',
  stroke = 'currentColor',
  strokeWidth = 2,
  className,
  style,
  children,
}: RawSvgProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox={viewBox}
    fill={fill}
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    style={style}
  >
    {children}
  </svg>
);

export const PlusIcon = ({ size = 16, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" strokeWidth={2.4} {...rest}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Svg>
);

export const PlayIcon = ({ size = 14, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" fill="currentColor" strokeWidth={0} {...rest}>
    <path d="M7 5 L19 12 L7 19 Z" />
  </Svg>
);

export const SparkleIcon = ({ size = 14, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" fill="currentColor" strokeWidth={0} {...rest}>
    <path d="M12 2 L14 9 L21 12 L14 15 L12 22 L10 15 L3 12 L10 9 Z" />
  </Svg>
);

export const ArrowLeftIcon = ({ size = 16, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" strokeWidth={2.2} {...rest}>
    <path d="M15 6 L9 12 L15 18" />
  </Svg>
);

export const ArrowRightIcon = ({ size = 16, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" strokeWidth={2.2} {...rest}>
    <path d="M9 6 L15 12 L9 18" />
  </Svg>
);

export const StepArrowIcon = ({ size = 22, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" {...rest}>
    <path d="M6 12 L18 12 M14 8 L18 12 L14 16" />
  </Svg>
);

export const LockIcon = ({ size = 22, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" strokeWidth={2.4} {...rest}>
    <rect x="5" y="10" width="14" height="10" rx="2.5" />
    <path d="M8 10 V7 Q8 4 12 4 Q16 4 16 7 V10" />
  </Svg>
);

export const XIcon = ({ size = 16, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" strokeWidth={2.2} {...rest}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </Svg>
);

export const SearchIcon = ({ size = 18, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" {...rest}>
    <circle cx="11" cy="11" r="7" />
    <path d="M17 17 L21 21" />
  </Svg>
);

export const UploadIcon = ({ size = 28, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" {...rest}>
    <path d="M12 16 V5 M7 10 L12 5 L17 10" />
    <path d="M4 17 V19 Q4 20 5 20 L19 20 Q20 20 20 19 V17" />
  </Svg>
);

export const MicIcon = ({ size = 18, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" strokeWidth={2} {...rest}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11 Q5 18 12 18 Q19 18 19 11" />
    <line x1="12" y1="18" x2="12" y2="21" />
  </Svg>
);

export const StopIcon = ({ size = 16, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" fill="currentColor" strokeWidth={0} {...rest}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </Svg>
);

export const TrashIcon = ({ size = 16, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" strokeWidth={2} {...rest}>
    <path d="M4 7 L20 7" />
    <path d="M9 7 V4 Q9 3 10 3 L14 3 Q15 3 15 4 V7" />
    <path d="M6 7 L7 20 Q7 21 8 21 L16 21 Q17 21 17 20 L18 7" />
  </Svg>
);

export const PencilIcon = ({ size = 14, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" strokeWidth={2} {...rest}>
    <path d="M14 4 L20 10 L8 22 L2 22 L2 16 Z" />
    <path d="M13 5 L19 11" />
  </Svg>
);

export const SpeakerIcon = ({ size = 24, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" fill="currentColor" strokeWidth={0} {...rest}>
    <path d="M4 9 L4 15 L9 15 L14 20 L14 4 L9 9 Z" />
  </Svg>
);

export const CheckIcon = ({ size = 14, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" strokeWidth={3} {...rest}>
    <path d="M5 12 L10 17 L19 7" />
  </Svg>
);

export const ChevronDownIcon = ({ size = 14, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" strokeWidth={2.2} {...rest}>
    <path d="M6 9 L12 15 L18 9" />
  </Svg>
);

export const ChoiceConnectorIcon = ({ size = 20, ...rest }: IconProps): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" strokeWidth={2.4} {...rest}>
    <path d="M6 9 L6 4 L11 4" />
    <path d="M18 15 L18 20 L13 20" />
    <path d="M20 4 L12 12" />
    <path d="M4 20 L12 12" />
  </Svg>
);

export type NavIconName = 'grid' | 'lib' | 'kid' | 'cog';

export const NavIcon = ({
  name,
  size = 22,
  ...rest
}: IconProps & { name: NavIconName }): JSX.Element => (
  <Svg size={size} viewBox="0 0 24 24" strokeWidth={1.8} {...rest}>
    <NavIconPaths name={name} />
  </Svg>
);

const NavIconPaths = ({ name }: { name: NavIconName }): JSX.Element => {
  switch (name) {
    case 'grid':
      return (
        <>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </>
      );
    case 'lib':
      return (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <circle cx="9" cy="10.5" r="1.4" />
          <path d="M4 16 L10 12 L16 16 L20 14" />
        </>
      );
    case 'kid':
      return (
        <>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 20 Q5 13 12 13 Q19 13 19 20" />
        </>
      );
    case 'cog':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3 L12 5 M12 19 L12 21 M3 12 L5 12 M19 12 L21 12 M5.5 5.5 L6.9 6.9 M17.1 17.1 L18.5 18.5 M5.5 18.5 L6.9 17.1 M17.1 6.9 L18.5 5.5" />
        </>
      );
  }
};
