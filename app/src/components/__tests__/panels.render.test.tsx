/* Render the panels, in node, without a DOM.
 *
 * This file exists because of a bug that shipped past everything else: the
 * split panel threw `shortAddress is not defined` on screen while `tsc -b`
 * and 167 unit tests were green. A circular import left the binding in its
 * temporal dead zone, which the type checker cannot see — the import is
 * perfectly valid TypeScript — and which a suite that never renders a
 * component cannot see either.
 *
 * `renderToStaticMarkup` runs the component body, which is the whole point: it
 * executes the code path that failed. Effects and data fetching do not run
 * under SSR, so this is no substitute for using the app. It is the cheapest
 * possible guard against a panel that cannot render at all.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DenominatePanel } from '../DenominatePanel';
import type { WalletSession } from '../../hooks/useWallet';
import type { EvmIdentitySession } from '../../hooks/useEvmIdentity';

const noWallet: WalletSession = {
  state: { phase: 'disconnected' },
  wallets: [],
  connect: async () => {},
  disconnect: () => {},
  refresh: async () => {},
  switchTo: async () => {},
  switching: false,
  balances: [],
};

function evm(state: EvmIdentitySession['state']): EvmIdentitySession {
  return {
    state,
    wallets: [],
    connect: async () => {},
    forget: () => {},
    takeSecrets: () => null,
    takeCredentials: () => null,
  };
}

const READY = evm({
  phase: 'ready',
  identity: {
    walletName: 'Test',
    evmAddress: '0x00000000000000000000000000000000000000ff',
    chainId: 1,
    starknetAddress: '0x0672000000000000000000000000000000000000000000000000000000008696',
    publicKey: '0x1',
  },
});

describe('DenominatePanel renders', () => {
  it('with nothing connected at all', () => {
    const html = renderToStaticMarkup(
      <DenominatePanel
        session={noWallet}
        evmSession={evm({ phase: 'idle' })}
        onConnect={() => {}}
        sizes={null}
      />,
    );
    expect(html).toContain('Connect a wallet');
  });

  /* The state a real user was in when the panel broke: an EVM identity derived
     and named in the header, no Starknet wallet connected. Nothing rendered
     this before, which is how the bug reached the screen. */
  it('with an EVM identity derived but no Starknet wallet', () => {
    const html = renderToStaticMarkup(
      <DenominatePanel
        session={noWallet}
        evmSession={READY}
        onConnect={() => {}}
        sizes={null}
      />,
    );
    expect(html).toContain('Connect a Starknet wallet');
    /* The refusal must name the account rather than ask for a step already done. */
    expect(html).toContain('0x0672');
    expect(html).not.toContain('Connect a wallet to do this for real');
  });
});
