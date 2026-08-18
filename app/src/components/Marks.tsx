/* Chain and token marks.
 *
 * A bridge without chain logos reads as a mockup — people identify networks by
 * their mark long before they read the name, and a picker showing only text
 * makes the user stop and parse where they should be recognising. These are
 * simplified geometry in each network's own colour rather than traced logos:
 * enough to identify at 22px, small enough to stay inline, and no trademark
 * assets vendored into the repo.
 */

type P = { size?: number; className?: string };

const disc = (fill: string) => <circle cx="12" cy="12" r="12" fill={fill} />;

function Mark({ size = 22, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* Ethereum — the octahedron, its two faces at different tints. */
const Ethereum = (p: P) => (
  <Mark {...p}>
    {disc('#627EEA')}
    <path d="M12 4.6 6.6 12.1 12 15.3z" fill="#fff" fillOpacity="0.6" />
    <path d="M12 4.6 17.4 12.1 12 15.3z" fill="#fff" fillOpacity="0.95" />
    <path d="M12 16.5 6.6 13.3 12 19.8z" fill="#fff" fillOpacity="0.6" />
    <path d="M12 16.5 17.4 13.3 12 19.8z" fill="#fff" fillOpacity="0.95" />
  </Mark>
);

/* Polygon — a hexagon, which is also the name. */
const Polygon = (p: P) => (
  <Mark {...p}>
    {disc('#8247E5')}
    <path
      d="M12 5.4 17.7 8.7 17.7 15.3 12 18.6 6.3 15.3 6.3 8.7z"
      fill="none"
      stroke="#fff"
      strokeWidth="1.9"
      strokeLinejoin="round"
    />
  </Mark>
);

/* Arbitrum — hexagon with the inner peak. */
const Arbitrum = (p: P) => (
  <Mark {...p}>
    {disc('#12AAFF')}
    <path
      d="M12 5.2 17.9 8.6 17.9 15.4 12 18.8 6.1 15.4 6.1 8.6z"
      fill="none"
      stroke="#fff"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M9 15.4 12 9.2 15 15.4"
      fill="none"
      stroke="#fff"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </Mark>
);

/* Optimism — the monogram is the mark. */
const Optimism = (p: P) => (
  <Mark {...p}>
    {disc('#FF0420')}
    <text
      x="12"
      y="12.6"
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize="8.6"
      fontWeight="700"
      fontFamily="'IBM Plex Sans', system-ui, sans-serif"
      fill="#fff"
    >
      OP
    </text>
  </Mark>
);

/* Base — a disc with one edge flattened. */
const Base = (p: P) => (
  <Mark {...p}>
    {disc('#0052FF')}
    <path d="M8.4 6.95A6.2 6.2 0 1 1 8.4 17.05z" fill="#fff" />
  </Mark>
);

/* USDC. */
export const UsdcMark = (p: P) => (
  <Mark {...p}>
    {disc('#2775CA')}
    <g fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="6.6" strokeWidth="1.3" />
      <path d="M12 7.1v9.8" />
      <path d="M14.3 9.8c0-1-1-1.6-2.3-1.6s-2.3.6-2.3 1.6 1 1.5 2.3 1.8 2.3.8 2.3 1.8-1 1.6-2.3 1.6-2.3-.6-2.3-1.6" />
    </g>
  </Mark>
);

/* Starknet. */
const Strk = (p: P) => (
  <Mark {...p}>
    {disc('#0C0C4F')}
    <path
      d="M6.6 13.4c2-2.6 3.8-3.9 5.4-3.9s3.4 1.3 5.4 3.9"
      fill="none"
      stroke="#fff"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
    <circle cx="17.4" cy="9.4" r="1.5" fill="#EC796B" />
  </Mark>
);

/* Anything the pool reports that we have no mark for. A lettered disc is
   honest about being a placeholder in a way a wrong logo would not be. */
const Letter = ({ symbol, ...p }: P & { symbol: string }) => (
  <Mark {...p}>
    {disc('#2a3644')}
    <text
      x="12"
      y="12.6"
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize="9"
      fontWeight="700"
      fontFamily="'IBM Plex Sans', system-ui, sans-serif"
      fill="#9aaab8"
    >
      {symbol.slice(0, 1)}
    </text>
  </Mark>
);

const BY_SYMBOL: Record<string, (p: P) => React.ReactElement> = {
  STRK: Strk,
  ETH: Ethereum,
  WETH: Ethereum,
  USDC: UsdcMark,
};

export function TokenMark({ symbol, size, className }: P & { symbol: string }) {
  const M = BY_SYMBOL[symbol.toUpperCase()];
  if (M) return <M size={size} className={className} />;
  return <Letter symbol={symbol} size={size} className={className} />;
}

const BY_ID: Record<number, (p: P) => React.ReactElement> = {
  1: Ethereum,
  137: Polygon,
  42161: Arbitrum,
  10: Optimism,
  8453: Base,
};

export function ChainMark({ id, size, className }: P & { id: number }) {
  const M = BY_ID[id];
  if (!M) return null;
  return <M size={size} className={className} />;
}
