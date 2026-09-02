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
import { ConnectWallet } from '../ConnectWallet';
import { ShieldForm } from '../ShieldForm';
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

describe('the account sheet', () => {
  /* Opened from the address pill, so it is where someone goes to ask "what is
     in my account". It used to answer a different question: the heading said
     "Connect a wallet" over the address they had come to look at, and the
     balance was not shown at all. */
  it('names the account rather than asking to connect again', () => {
    const html = renderToStaticMarkup(
      <ConnectWallet session={noWallet} evmSession={READY} open={true} setOpen={() => {}} />,
    );
    expect(html).toContain('Your account');
    expect(html).not.toContain('<h2 id="wsel-h">Connect a wallet</h2>');
    /* Both halves of the identity, each copyable. */
    expect(html).toContain('0x0672');
    expect(html).toContain('0x0000');
  });

  it('reports the public balance, and separates it from the shielded one', () => {
    const html = renderToStaticMarkup(
      <ConnectWallet session={noWallet} evmSession={READY} open={true} setOpen={() => {}} />,
    );
    expect(html).toContain('Holds publicly');
    /* Under SSR the read has not resolved. "Reading…" and "Nothing yet" must
       stay distinguishable — an unknown balance shown as zero would tell
       someone their transfer had not landed when it may have. */
    expect(html).toContain('Reading…');
    expect(html).toContain('Shielded: nothing until the first deposit');
  });

  it('still offers the wallet list when there is no identity', () => {
    const html = renderToStaticMarkup(
      <ConnectWallet
        session={noWallet}
        evmSession={evm({ phase: 'idle' })}
        open={true}
        setOpen={() => {}}
      />,
    );
    expect(html).toContain('Connect a wallet');
  });
});

/* The shield form, which is the newest thing here and the only one that can
   move money from the account panel. */
describe('ShieldForm', () => {
  const conn = {
    wallet: { id: 'ready', name: 'Ready' },
    walletVersion: '5.33.8',
    account: {} as never,
    address: '0x063b56b186b5fb72c8cff15911d418c4d25529e6fc1fab4d98f75a13c0c7734e',
    chainId: '0x534e5f5345504f4c4941',
    network: {
      name: 'Starknet Sepolia',
      chainId: '0x534e5f5345504f4c4941',
      explorer: 'https://sepolia.voyager.online',
      tokens: [],
      bucketers: [],
    },
    provider: {} as never,
    support: { kind: 'unregistered' as const },
    balances: [],
  } as unknown as Parameters<typeof ShieldForm>[0]['conn'];

  const strk = {
    token: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    symbol: 'STRK',
    decimals: 18,
    amount: 3029n * 10n ** 18n,
  };

  it('renders, and offers the public balance it was given', () => {
    const html = renderToStaticMarkup(
      <ShieldForm conn={conn} pub={[strk]} onShielded={() => {}} />,
    );
    expect(html).toContain('Shield');
    /* The figure on screen has to be the one passed in, not a second read. */
    expect(html).toContain('3,029');
    expect(html).toContain('STRK');
  });

  it('says nothing at all when there is nothing public to shield', () => {
    /* An empty form under "Nothing shielded yet" would be two dead ends
       stacked. */
    expect(renderToStaticMarkup(<ShieldForm conn={conn} pub={[]} onShielded={() => {}} />)).toBe('');
  });

  it('stays out of the way of a wallet that cannot do STRK20', () => {
    /* The notice at the top of the page explains that case in full, and a
       button that cannot work is worse than no button. */
    const old = { ...conn, support: { kind: 'unsupported' as const, message: 'Unknown request type' } };
    expect(
      renderToStaticMarkup(<ShieldForm conn={old as never} pub={[strk]} onShielded={() => {}} />),
    ).toBe('');
  });
});
