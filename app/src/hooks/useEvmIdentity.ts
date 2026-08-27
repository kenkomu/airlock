/* The any-chain door's state machine.
 *
 * Modelled as phases rather than a boolean for the same reason `useWallet` is:
 * every step here can stall or be refused, and the user needs to know which one
 * they are in. "Approve the connection in MetaMask" and "sign the message in
 * MetaMask" look identical from outside and need different words.
 *
 * Secrets deliberately do not live in React state. `identity.ts` says not to put
 * the private key or viewing key anywhere a devtools extension can read back,
 * and component state is exactly that — it is serialisable, it is inspectable
 * through the React tree, and it survives in DevTools' own retained snapshots.
 * So the render-visible state carries only the address and public key, which are
 * not secret, and the spending material sits in a ref that callers reach through
 * `takeSecrets()` at the moment they act.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AIRLOCK_IDENTITY_SIGN_MESSAGE,
  OZ_ACCOUNT_CLASS_HASH,
  deriveIdentity,
  type DerivedIdentity,
} from '../lib/identity';
import {
  currentChainId,
  isUserRejection,
  requestAccount,
  signIdentityMessage,
  subscribeEvmWallets,
  type EvmWallet,
} from '../lib/evm';

/* What the interface may show. Note there is no field here that can spend
   anything — that is the point of the split. */
export interface EvmIdentityPublic {
  /* The wallet the user picked, so the UI can name it. */
  walletName: string;
  /* Their address on their own chain. */
  evmAddress: string;
  /* Which chain they were on when they signed. Recorded rather than enforced:
     the signature is chain-independent, so the derived account is the same
     wherever they happened to be, and switching networks must not silently
     change who they are. */
  chainId: number;
  /* The derived Starknet account. Shown before anything is spent, so it can be
     checked against another tool. */
  starknetAddress: string;
  publicKey: string;
}

export type EvmIdentityPhase =
  | { phase: 'idle' }
  /* Waiting on the wallet to share an account. */
  | { phase: 'connecting'; walletName: string }
  /* Waiting on the signature. Separated from `connecting` because it is a
     different prompt and a different instruction. */
  | { phase: 'signing'; walletName: string }
  | { phase: 'ready'; identity: EvmIdentityPublic }
  | { phase: 'error'; message: string };

/* Everything the deposit engine needs, none of which may be rendered.
 *
 * The engine re-derives the Starknet key and viewing key from the raw signature
 * itself, so it wants the signature rather than the derived material. Kept in
 * the same ref as the rest — in memory, never state, never storage — and reached
 * through a getter so it cannot land in a render or a dependency array. */
export interface DepositCredentials {
  signature: `0x${string}`;
  provider: unknown;
  chainId: number;
}

export interface EvmIdentitySession {
  state: EvmIdentityPhase;
  /* EVM wallets the browser announced, via EIP-6963. */
  wallets: EvmWallet[];
  /* Run the whole flow: share an account, sign once, derive. */
  connect: (wallet: EvmWallet) => Promise<void>;
  forget: () => void;
  /* The spending material, for the code that actually submits pool actions.
     Returns null unless an identity has been derived. Kept as a function so it
     never lands in a render and never ends up in a dependency array. */
  takeSecrets: () => DerivedIdentity | null;
  /* The signature and provider, for the deposit path. Null unless an identity
     has been derived in this tab. Re-signing would be the alternative and would
     cost the user a second wallet prompt for something we already have. */
  takeCredentials: () => DepositCredentials | null;
}

export function useEvmIdentity(): EvmIdentitySession {
  const [wallets, setWallets] = useState<EvmWallet[]>([]);
  const [state, setState] = useState<EvmIdentityPhase>({ phase: 'idle' });
  const secrets = useRef<DerivedIdentity | null>(null);
  const creds = useRef<DepositCredentials | null>(null);

  /* Subscribed on mount rather than when the picker opens: the discovery module
     starts listening at import, and a wallet that announced during page load
     should already be in the first render of the list. */
  useEffect(() => subscribeEvmWallets(setWallets), []);

  /* Drop the key material if this component ever goes away. Not a substitute for
     the user disconnecting — it is the floor. */
  useEffect(() => {
    return () => {
      secrets.current = null;
      creds.current = null;
    };
  }, []);

  const connect = useCallback(async (wallet: EvmWallet) => {
    const walletName = wallet.info.name;
    setState({ phase: 'connecting', walletName });
    try {
      const evmAddress = await requestAccount(wallet.provider);
      /* Read the chain before prompting for the signature: it is a free call,
         and it means the one thing we record about their chain is true at the
         moment they signed rather than whenever we got round to asking. */
      const chainId = await currentChainId(wallet.provider);

      setState({ phase: 'signing', walletName });
      const signature = await signIdentityMessage(
        wallet.provider,
        evmAddress,
        AIRLOCK_IDENTITY_SIGN_MESSAGE,
      );

      const identity = deriveIdentity(signature, OZ_ACCOUNT_CLASS_HASH);
      secrets.current = identity;
      creds.current = {
        signature: signature as `0x${string}`,
        provider: wallet.provider,
        chainId,
      };
      setState({
        phase: 'ready',
        identity: {
          walletName,
          evmAddress,
          chainId,
          starknetAddress: identity.address,
          publicKey: identity.publicKey,
        },
      });
    } catch (e) {
      secrets.current = null;
      creds.current = null;
      if (isUserRejection(e)) {
        /* Declining is a decision, not a fault. Back to the start with nothing
           said, rather than an error banner blaming them for it. */
        setState({ phase: 'idle' });
        return;
      }
      setState({
        phase: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const forget = useCallback(() => {
    secrets.current = null;
    creds.current = null;
    setState({ phase: 'idle' });
  }, []);

  const takeSecrets = useCallback(() => secrets.current, []);
  const takeCredentials = useCallback(() => creds.current, []);

  return { state, wallets, connect, forget, takeSecrets, takeCredentials };
}
