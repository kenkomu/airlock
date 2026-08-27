/* The any-chain door's discovery and signing, tested against a fake wallet.
 *
 * Two of these pin bugs that are invisible until a real user hits them: the
 * announce-before-request race, which makes a wallet silently undiscoverable for
 * the whole session, and the `personal_sign` argument order, which fails in a way
 * that reads like the wallet is broken rather than like we called it wrong.
 *
 * The suite runs in the `node` environment like the rest of this project, so
 * there is no DOM. A bare `EventTarget` stands in for `window`, which is all the
 * discovery code actually uses — adding jsdom to test three event listeners would
 * cost more than it proves.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EthereumProvider } from '../../../vendor/bridge-core/src/lib/ethereum';

/* A provider that records what it was asked, so argument order can be asserted
   rather than assumed. */
function fakeProvider(answers: Record<string, unknown>): {
  provider: EthereumProvider;
  calls: { method: string; params?: unknown[] }[];
} {
  const calls: { method: string; params?: unknown[] }[] = [];
  const provider: EthereumProvider = {
    request: async (args) => {
      calls.push(args);
      if (args.method in answers) {
        const answer = answers[args.method];
        if (answer instanceof Error) throw answer;
        return answer;
      }
      throw new Error(`unexpected method ${args.method}`);
    },
    on: () => {},
    removeListener: () => {},
  };
  return { provider, calls };
}

/* Discovery keeps module-level state (the found map, the listener installed at
   import), so every discovery test needs a fresh module instance.
 *
 * Order matters and is the point: the module attaches its listener as an import
 * side effect, so `window` has to exist *before* the import. Stubbing it
 * afterwards would attach the listener to a window the test then throws away,
 * and every announcement would vanish — which is exactly how this went wrong the
 * first time. */
function stubWindow(): EventTarget {
  const target = new EventTarget();
  vi.stubGlobal('window', target);
  return target;
}

async function freshEvm(): Promise<typeof import('../evm')> {
  vi.resetModules();
  return import('../evm');
}

/* Stub a window and import against it, in that order. */
async function freshEvmWithWindow(): Promise<{
  evm: typeof import('../evm');
  target: EventTarget;
}> {
  const target = stubWindow();
  const evm = await freshEvm();
  return { evm, target };
}

/* `provider` is nullable rather than optional-with-a-default: a default
   parameter fires on an explicit `undefined` too, so the "announcement with no
   provider" case was quietly handed one and the test passed for the wrong
   reason. `null` says absent and means it. */
function announce(
  target: EventTarget,
  info: { rdns: string; name: string; uuid?: string; icon?: string },
  provider: EthereumProvider | null = fakeProvider({}).provider,
): void {
  const event = new Event('eip6963:announceProvider') as Event & { detail?: unknown };
  event.detail = {
    info: { uuid: info.uuid ?? 'u', icon: info.icon ?? '', ...info },
    provider: provider ?? undefined,
  };
  target.dispatchEvent(event);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isUserRejection', () => {
  /* Declining a prompt is a decision, not a fault, and must not render as one. */
  it('recognises the EIP-1193 rejection code', async () => {
    const { isUserRejection } = await freshEvm();
    expect(isUserRejection({ code: 4001 })).toBe(true);
  });

  it('recognises the string form some wallets use instead', async () => {
    const { isUserRejection } = await freshEvm();
    expect(isUserRejection({ code: 'ACTION_REJECTED' })).toBe(true);
  });

  it('recognises it from the message when there is no code', async () => {
    const { isUserRejection } = await freshEvm();
    expect(isUserRejection(new Error('User rejected the request'))).toBe(true);
    expect(isUserRejection(new Error('user denied message signature'))).toBe(true);
  });

  it('does not claim a real failure was the user changing their mind', async () => {
    /* The mirror of `isNamedRefusal` in denominate.ts: swallowing a genuine
       failure as "you cancelled" hides the bug and blames the user for it. */
    const { isUserRejection } = await freshEvm();
    expect(isUserRejection(new Error('network request failed'))).toBe(false);
    expect(isUserRejection({ code: -32603 })).toBe(false);
    expect(isUserRejection(null)).toBe(false);
  });
});

describe('requestAccount', () => {
  it('returns the offered account', async () => {
    const { requestAccount } = await freshEvm();
    const { provider } = fakeProvider({ eth_requestAccounts: ['0xabc'] });
    expect(await requestAccount(provider)).toBe('0xabc');
  });

  it('refuses to report success when the wallet shared nothing', async () => {
    /* A locked wallet, or one with every account deselected, connects fine and
       returns []. Treating that as connected strands the user. */
    const { requestAccount } = await freshEvm();
    const { provider } = fakeProvider({ eth_requestAccounts: [] });
    await expect(requestAccount(provider)).rejects.toThrow(/did not share an account/);
  });
});

describe('signIdentityMessage', () => {
  it('passes message then address, which is the order personal_sign wants', async () => {
    /* Reversed, this fails with an opaque wallet error. Pinning the order is the
       cheapest way to stop that from ever being re-debugged. */
    const { signIdentityMessage } = await freshEvm();
    const { provider, calls } = fakeProvider({ personal_sign: '0xdeadbeef' });
    await signIdentityMessage(provider, '0xaddr', 'hello');
    expect(calls[0].method).toBe('personal_sign');
    expect(calls[0].params).toEqual(['hello', '0xaddr']);
  });

  it('sends the message as text, not pre-encoded hex', async () => {
    /* Pre-encoding shows the user a wall of hex instead of the sentence telling
       them what they are agreeing to. */
    const { signIdentityMessage } = await freshEvm();
    const { provider, calls } = fakeProvider({ personal_sign: '0xabc' });
    await signIdentityMessage(provider, '0xaddr', 'Airlock — derive');
    expect(calls[0].params?.[0]).toBe('Airlock — derive');
  });

  it('rejects an answer that is not a signature', async () => {
    /* Every derived key folds this value, so a malformed answer has to stop the
       flow rather than produce an account nobody can reach. */
    const { signIdentityMessage } = await freshEvm();
    for (const bad of [null, '', 'nope', '0xzz']) {
      const { provider } = fakeProvider({ personal_sign: bad });
      await expect(signIdentityMessage(provider, '0xa', 'm')).rejects.toThrow(
        /form Airlock cannot use/,
      );
    }
  });
});

describe('wallet discovery', () => {
  it('sees a wallet that announced before we asked', async () => {
    /* The race this file exists to prevent. An eager wallet announces on page
       load; if the listener were installed only around the request, that wallet
       would be invisible for the entire session. */
    const { evm, target } = await freshEvmWithWindow();
    /* Announce strictly before anyone subscribes. The listener is already in
       place because importing the module installed it. */
    announce(target, { rdns: 'io.metamask', name: 'MetaMask' });

    const seen: string[] = [];
    evm.subscribeEvmWallets((ws) => seen.push(...ws.map((w) => w.info.rdns)));
    expect(seen).toContain('io.metamask');
  });

  it('reports a wallet that announces after subscribing', async () => {
    const { evm, target } = await freshEvmWithWindow();
    const batches: string[][] = [];
    evm.subscribeEvmWallets((ws) => batches.push(ws.map((w) => w.info.rdns)));
    announce(target, { rdns: 'io.rabby', name: 'Rabby' });
    expect(batches.at(-1)).toEqual(['io.rabby']);
  });

  it('shows a wallet once even when it announces repeatedly', async () => {
    /* Wallets announce both spontaneously and in response to the request event,
       so duplicates are normal, not exceptional. */
    const { evm, target } = await freshEvmWithWindow();
    const provider = fakeProvider({}).provider;
    announce(target, { rdns: 'io.metamask', name: 'MetaMask' }, provider);
    announce(target, { rdns: 'io.metamask', name: 'MetaMask' }, provider);
    expect(evm.knownEvmWallets()).toHaveLength(1);
  });

  it('ignores an announcement missing its provider', async () => {
    /* A name with no provider renders a button that cannot do anything. */
    const { evm, target } = await freshEvmWithWindow();
    announce(target, { rdns: 'io.broken', name: 'Broken' }, null);
    expect(evm.knownEvmWallets()).toHaveLength(0);
  });

  it('ignores an announcement with no rdns to identify it by', async () => {
    const { evm, target } = await freshEvmWithWindow();
    announce(target, { rdns: '', name: 'Anonymous' });
    expect(evm.knownEvmWallets()).toHaveLength(0);
  });

  it('orders wallets by name so the picker does not reshuffle', async () => {
    /* Announcement order is load order, which varies between reloads. A list
       that reorders under the cursor causes mis-clicks. */
    const { evm, target } = await freshEvmWithWindow();
    announce(target, { rdns: 'io.zerion', name: 'Zerion' });
    announce(target, { rdns: 'io.metamask', name: 'MetaMask' });
    announce(target, { rdns: 'io.rabby', name: 'Rabby' });
    expect(evm.knownEvmWallets().map((w) => w.info.name)).toEqual([
      'MetaMask',
      'Rabby',
      'Zerion',
    ]);
  });

  it('stops calling a subscriber that has unsubscribed', async () => {
    const { evm, target } = await freshEvmWithWindow();
    let calls = 0;
    const off = evm.subscribeEvmWallets(() => {
      calls += 1;
    });
    const afterSubscribe = calls;
    off();
    announce(target, { rdns: 'io.metamask', name: 'MetaMask' });
    expect(calls).toBe(afterSubscribe);
  });
});

describe('shortEvmAddress', () => {
  it('keeps enough of both ends to compare against another tool', async () => {
    const { shortEvmAddress } = await freshEvm();
    expect(shortEvmAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(
      '0x1234…5678',
    );
  });
});
