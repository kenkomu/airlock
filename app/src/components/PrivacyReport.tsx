/* Live consequences of the current transfer settings.
 *
 * Sits beside the form and updates as the user types, so the cost of a choice is
 * visible while they are making it rather than buried in a confirmation screen.
 * Per-factor, never a single score — see lib/exposure.ts for why.
 */

import type { ExposureReport, Level } from '../lib/exposure';
import { SealDiagram } from './SealDiagram';
import { IconCheck, IconAlert, IconEyeOff } from './Icons';

const HEAD: Record<Level, { label: string; blurb: string }> = {
  sealed: {
    label: 'Sealed',
    blurb:
      'On these settings the funding chain and the destination chain should not be linkable.',
  },
  leak: {
    label: 'Linkable',
    blurb:
      'Something here is correlatable. The transfer will work — it just will not be private.',
  },
  blocked: {
    label: 'Not private',
    blurb:
      'These settings cannot deliver unlinkability. Change them, or accept that this transfer is traceable.',
  },
};

function LevelIcon({ level }: { level: Level }) {
  if (level === 'sealed') return <IconCheck />;
  if (level === 'leak') return <IconAlert />;
  return <IconEyeOff />;
}

interface Props {
  report: ExposureReport;
  fromName: string;
  toName: string;
}

export function PrivacyReport({ report, fromName, toName }: Props) {
  const head = HEAD[report.overall];

  return (
    <section className="card" aria-labelledby="rep-h">
      <header className="card-h">
        <h2 id="rep-h">Privacy report</h2>
        <span className="card-h-note">live</span>
      </header>

      <SealDiagram
        state={report.overall === 'sealed' ? 'sealed' : 'leak'}
        inLabel={fromName}
        outLabel={toName}
      />

      <div className={`verdict verdict-${report.overall}`} role="status">
        <span className="verdict-badge">{head.label.toUpperCase()}</span>
        <p>{head.blurb}</p>
      </div>

      <ul className="factors">
        {report.factors.map((f) => (
          <li key={f.key} className={`factor factor-${f.level}`}>
            <span className={`factor-ico ico-${f.level}`}>
              <LevelIcon level={f.level} />
            </span>
            <div className="factor-body">
              <span className="factor-h">
                {f.label}
                <span className={`factor-tag tag-${f.level}`}>
                  {f.level === 'sealed' ? 'ok' : f.level === 'leak' ? 'leaks' : 'blocked'}
                </span>
              </span>
              <p className="sm">{f.detail}</p>
              {f.fix && <p className="sm factor-fix">{f.fix}</p>}
            </div>
          </li>
        ))}
      </ul>

      <footer className="card-f">
        <p className="muted sm">
          Worst factor decides the verdict — privacy does not average. A perfect
          amount does not rescue a two-minute round trip, and neither survives an
          empty pool.
        </p>
      </footer>
    </section>
  );
}
