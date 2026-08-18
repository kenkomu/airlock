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
  refreshBalances,
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
  balances: ShieldedBalance[];
}

export function useWallet(): WalletSession {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [state, setState] = useState<WalletPhase>({ phase: 'disconnected' });
  const [balances, setBalances] = useState<ShieldedBalance[]>([]);

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

  const refresh = useCallback(async () => {
    if (state.phase !== 'connected') return;
    try {
      setBalances(await refreshBalances(state.conn));
    } catch {
      /* A failed refresh keeps the last known figures rather than blanking the
         panel; the connect-time probe already reported whether reads work. */
    }
  }, [state]);

  return { state, wallets, connect, disconnect, refresh, balances };
}
