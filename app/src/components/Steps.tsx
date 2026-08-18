/* How a private round trip actually works.
 *
 * Progressive disclosure: a first-time user needs the shape of the process
 * before the controls make sense, and the "wait" step is the one every
 * competitor omits — so it gets equal billing here rather than a footnote.
 */

import { IconWallet, IconShield, IconClock, IconLayers } from './Icons';

const STEPS = [
  {
    n: 1,
    icon: <IconWallet />,
    title: 'Fund',
    body: 'Send USDC from any supported chain. This leg is public, and no tool can change that.',
  },
  {
    n: 2,
    icon: <IconShield />,
    title: 'Shield',
    body: 'The bridge deposits into the pool and credits you an encrypted note. Your balance is now private.',
  },
  {
    n: 3,
    icon: <IconClock />,
    title: 'Wait',
    body: 'Let other deposits land between your legs. Skipping this is what makes "instant" privacy tools traceable.',
    emphasis: true,
  },
  {
    n: 4,
    icon: <IconLayers />,
    title: 'Withdraw',
    body: 'Take it out on a different chain in standard denominations. You approve this leg yourself.',
  },
];

export function Steps() {
  return (
    <section className="ref-block" aria-labelledby="steps-h">
      <h3 id="steps-h">How a private round trip works</h3>
      <ol className="steps">
        {STEPS.map((s) => (
          <li key={s.n} className={`step${s.emphasis ? ' step-key' : ''}`}>
            <span className="step-ico">{s.icon}</span>
            <span className="step-n mono">{String(s.n).padStart(2, '0')}</span>
            <h4>{s.title}</h4>
            <p className="sm">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
