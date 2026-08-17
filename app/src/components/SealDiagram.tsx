/* The airlock, drawn.
 *
 * A real airlock's defining property is that both doors are never open at once —
 * that is the whole mechanism, not a metaphor bolted on afterwards. The same
 * property is what this product sells: the chain you funded from and the chain
 * you withdrew to must not be linkable.
 *
 * So the diagram is wired to actual state. When the current plan would leak
 * (a distinctive amount, or legs chained too tightly in time), the link between
 * the two doors is drawn solid and amber. When it holds, the link is broken.
 * It is a status indicator that happens to be a picture, not an illustration.
 */

export type SealState = 'sealed' | 'leak';

interface Props {
  state: SealState;
  inLabel: string;
  outLabel: string;
}

export function SealDiagram({ state, inLabel, outLabel }: Props) {
  const leaking = state === 'leak';
  const linkColor = leaking ? 'var(--leak)' : 'var(--border)';

  return (
    <figure className="seal">
      <svg
        viewBox="0 0 520 150"
        role="img"
        aria-label={
          leaking
            ? `Airlock diagram: the ${inLabel} side and the ${outLabel} side are currently linkable`
            : `Airlock diagram: the ${inLabel} side and the ${outLabel} side are sealed from each other`
        }
      >
        {/* chamber */}
        <rect
          x="185"
          y="34"
          width="150"
          height="82"
          rx="6"
          fill="var(--surface-2)"
          stroke="var(--border)"
        />
        <text x="260" y="70" className="d-chamber" textAnchor="middle">
          PRIVACY POOL
        </text>
        <text x="260" y="90" className="d-chamber-sub" textAnchor="middle">
          notes · nullifiers
        </text>

        {/* inbound door */}
        <rect
          x="168"
          y="26"
          width="10"
          height="98"
          rx="2"
          fill="var(--sealed)"
          opacity="0.85"
        />
        {/* outbound door */}
        <rect
          x="342"
          y="26"
          width="10"
          height="98"
          rx="2"
          fill="var(--sealed)"
          opacity="0.85"
        />

        {/* inbound leg */}
        <line
          x1="52"
          y1="75"
          x2="164"
          y2="75"
          stroke="var(--accent)"
          strokeWidth="2"
        />
        <polygon points="164,75 156,70 156,80" fill="var(--accent)" />
        <text x="52" y="60" className="d-label">
          {inLabel}
        </text>

        {/* outbound leg */}
        <line
          x1="356"
          y1="75"
          x2="468"
          y2="75"
          stroke="var(--accent)"
          strokeWidth="2"
        />
        <polygon points="468,75 460,70 460,80" fill="var(--accent)" />
        <text x="468" y="60" className="d-label" textAnchor="end">
          {outLabel}
        </text>

        {/* the correlation link — broken when sealed, solid when it leaks */}
        <path
          d="M 52 128 L 468 128"
          stroke={linkColor}
          strokeWidth={leaking ? 2 : 1.5}
          strokeDasharray={leaking ? undefined : '3 9'}
          fill="none"
        />
        <text
          x="260"
          y="145"
          textAnchor="middle"
          className={leaking ? 'd-link d-link-leak' : 'd-link'}
        >
          {leaking ? 'LINKABLE' : 'NO ON-CHAIN LINK'}
        </text>
      </svg>
    </figure>
  );
}
