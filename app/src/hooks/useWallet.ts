/* Wallet session state.
 *
 * Connection is a state machine rather than a boolean because four of its
 * states are things the user has to act on — connecting, wrong network, wallet
 * cannot do STRK20, no viewing key registered — and a boolean collapses all of
 * them into "not connected", which tells the user nothing about what to fix.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  connect as connectWallet,
  onWalletChange,
  refreshBalances,
  switchNetwork,
  watchWallets,
  type Connection,
  type ShieldedBalance,
  type Wallet,
} from '../lib/wallet';

export type WalletPhase =
  | { phase: 'disconnected' }
  | { phase: 'connecting'; name: string }
  | { phase: 'connected'; conn: Connection }
  | { phase: 'error'; message: string };

export interface WalletSession {
  state: WalletPhase;
  /* Wallets the browser has, minus MetaMask. Updates as extensions register. */
  wallets: Wallet[];
  connect: (w: Wallet) => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
  /* Ask the wallet to change chain, then rebuild the session on the new one. */
  switchTo: (chainId: string) => Promise<void>;
  switching: boolean;
  balances: ShieldedBalance[];
}

export function useWallet(): WalletSession {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [state, setState] = useState<WalletPhase>({ phase: 'disconnected' });
  const [balances, setBalances] = useState<ShieldedBalance[]>([]);
  const [switching, setSwitching] = useState(false);

  /* Subscribed on mount, not on picker open: extensions register a moment after
     page load, and a store created at click time can miss one that is present. */
  useEffect(() => watchWallets(setWallets), []);

  const connect = useCallback(async (w: Wallet) => {
    setState({ phase: 'connecting', name: w.name });
    try {
      const conn = await connectWallet(w);
      setState({ phase: 'connected', conn });
      setBalances(conn.balances);
    } catch (e) {
      setState({
        phase: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ phase: 'disconnected' });
    setBalances([]);
  }, []);

  /* Re-read everything after the chain changes. Reconnecting rather than
     patching the chain id in place: the provider, account and shielded balances
     are all chain-specific, and a Connection carrying a new chain id with old
     balances would be confidently wrong. */
  const reconnect = useCallback(async (w: Wallet) => {
    try {
      const conn = await connectWallet(w);
      setState({ phase: 'connected', conn });
      setBalances(conn.balances);
    } catch (e) {
      setState({
        phase: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  /* The wallet can change network from inside the extension, with no click of
     ours involved. Without this the badge keeps claiming the old chain, which
     is the one thing it exists to be right about. */
  useEffect(() => {
    if (state.phase !== 'connected') return;
    const w = state.conn.wallet;
    return onWalletChange(w, () => {
      void reconnect(w);
    });
  }, [state, reconnect]);

  const switchTo = useCallback(
    async (chainId: string) => {
      if (state.phase !== 'connected') return;
      const w = state.conn.wallet;
      setSwitching(true);
      try {
        /* A refusal is not an error to shout about — the user said no. The
           wallet stays where it was and so does the session. */
        if (await switchNetwork(w, chainId)) await reconnect(w);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (!/reject|denied|declined|cancel/i.test(m)) {
          setState({ phase: 'error', message: m });
        }
      } finally {
        setSwitching(false);
      }
    },
    [state, reconnect],
  );

  const refresh = useCallback(async () => {
    if (state.phase !== 'connected') return;
    try {
      setBalances(await refreshBalances(state.conn));
    } catch {
      /* A failed refresh keeps the last known figures rather than blanking the
         panel; the connect-time probe already reported whether reads work. */
    }
  }, [state]);

  return { state, wallets, connect, disconnect, refresh, switchTo, switching, balances };
}
