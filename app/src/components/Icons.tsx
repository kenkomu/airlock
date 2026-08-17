/* Inline SVG icons. No emoji — emoji render inconsistently across platforms and
   read as decoration on a tool that handles money. All icons inherit
   currentColor and size from font-size, so they align with adjacent text. */

type P = { className?: string };

const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false as const,
};

export const IconShield = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6l7-3z" />
  </svg>
);

export const IconArrowRight = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
);

export const IconSwap = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </svg>
);

export const IconClock = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconAlert = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 4.5l8 14H4l8-14z" />
    <path d="M12 10v4M12 16.6v.2" />
  </svg>
);

export const IconCheck = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
);

export const IconEye = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEyeOff = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 4l16 16" />
    <path d="M9.7 5.9A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-2.6 3.4M6.5 8.1A17 17 0 002.5 12S6 18.5 12 18.5c.9 0 1.7-.1 2.5-.4" />
  </svg>
);

export const IconLayers = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 3.5l8 4.5-8 4.5-8-4.5 8-4.5z" />
    <path d="M4 12.5l8 4.5 8-4.5" />
  </svg>
);

export const IconWallet = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M3 10h18M16.5 14.5h.2" />
  </svg>
);
