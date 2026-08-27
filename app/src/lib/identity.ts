/* The second door: a Starknet identity derived from a wallet on another chain.
 *
 * Airlock has two ways in, and they have genuinely different privacy properties.
 * Saying so plainly is the whole point of this file existing separately from
 * `wallet.ts`:
 *
 *   Starknet door  — a privacy-enabled Starknet wallet holds the viewing key and
 *                    does the proving. This app never sees either. That is the
 *                    claim `wallet.ts` supports and the README makes.
 *
 *   Any-chain door — the user has MetaMask and no Starknet wallet at all, so
 *                    there is nothing to hold a key for them. One signature on
 *                    their own chain deterministically derives a Starknet account
 *                    key and a pool viewing key, in this tab. The app does see
 *                    them, for as long as the tab is open.
 *
 * The second is weaker, and it is the only thing that can serve the person the
 * RFP is actually about — someone on Arbitrum who should not have to learn
 * Starknet. Offering it is right; implying it has the first door's properties
 * would not be. Nothing here is ever written to storage, and the caller is
 * expected to hold the result in memory and drop it on disconnect.
 *
 * The derivation itself is not ours. It comes from StarkWare's bridge
 * (`app/vendor/bridge-core`), so an account derived here is the same account
 * their tooling derives from the same signature — which matters, because funds
 * that only Airlock can reach would be a trap.
 */

/* Imported from the individual modules rather than the package's `index`
   barrel, and that is a size decision rather than a style one. The barrel
   re-exports the Polygon-EOA and commitment derivations too, which pull in
   `@noble/curves`' secp256k1 — 17 KB gzipped for code this door never calls,
   landing in the initial bundle and slowing the one thing this app is best at,
   which is answering before anyone connects anything. The two modules below
   need only `starknet`. */
import {
  deriveStarknetAccount,
  deriveStarknetPrivateKey,
  type StarknetAccount,
} from '../../vendor/bridge-core/src/derivation/starknet-key';
import { deriveViewingKey } from '../../vendor/bridge-core/src/derivation/viewing-key';

/* The message the user signs. This string IS the identity domain: the signature
   over it is the only secret input, so changing a single byte — the wording, the
   version, a stray space — derives a different account and a different viewing
   key, and any funds sitting in the old one become unreachable through this app.
   Treat it as frozen. A change is a migration, not an edit.

   It is deliberately not the message StarkWare's own bridge app uses. Sharing a
   domain across apps would mean a bug or a compromise in either one reaches the
   other's funds, and it would make the two apps' accounts indistinguishable when
   they should not be. */
export const AIRLOCK_IDENTITY_SIGN_MESSAGE = [
  'Airlock — derive your Starknet privacy keys',
  '',
  'Signing this proves you control this wallet. Airlock uses the signature to',
  'derive a Starknet account and a privacy-pool viewing key, here in your',
  'browser. The signature is not sent anywhere and nothing is stored.',
  '',
  'This is an off-chain signature. It is not a transaction and costs no gas.',
  '',
  'Version: 1',
].join('\n');

/* The account class the derived address is computed against.
 *
 * This is part of the identity domain, not a deployment detail: the class hash
 * is folded into the address, so pointing at a different account class derives a
 * different address from the same signature and leaves the old one holding the
 * funds. It is pinned here for the same reason the message above is.
 *
 * OpenZeppelin's account, the one StarkWare's own bridge deploys. A baked value
 * is only safe if the class is actually declared on chain — an address computed
 * against an undeclared class cannot be deployed to, and the failure arrives
 * after the user has funded it. Checked rather than assumed: `starknet_getClass`
 * returns it on Starknet mainnet and on Sepolia, and the hash is the same on
 * both, which is why one constant covers both networks. */
export const OZ_ACCOUNT_CLASS_HASH =
  '0x5b4b537eaa2399e3aa99c4e2e0208ebd6c71bc1467938cd52c798c601e43564';

/* A derived identity, in memory only.
 *
 * `privateKey` and `viewingKey` are secrets. They are on this object because the
 * pool actions genuinely need them, not because they are safe to pass around:
 * never log this, never serialise it, never put it in React state that a devtools
 * extension can read back, and never persist it. The address and public key are
 * not secret and are the only fields safe to display. */
export interface DerivedIdentity {
  readonly address: string;
  readonly publicKey: string;
  readonly privateKey: string;
  readonly viewingKey: bigint;
}

/* Derive everything from one signature.
 *
 * Synchronous and pure — no network, no wallet round trip. The caller has already
 * obtained the signature; this only folds it. That separation is what lets the
 * connect flow ask for exactly one wallet prompt. */
export function deriveIdentity(signature: string, classHash: string): DerivedIdentity {
  const privateKey = deriveStarknetPrivateKey(signature);
  const account: StarknetAccount = deriveStarknetAccount(privateKey, classHash);
  return {
    address: account.address,
    publicKey: account.publicKey,
    privateKey,
    viewingKey: deriveViewingKey(signature),
  };
}

/* Format a derived address for display.
 *
 * Shown before anything is signed or spent, because the address is the one thing
 * the user can check against another tool — and an address they cannot verify is
 * an address they have to trust us about. */
export function shortAddress(address: string): string {
  const hex = address.startsWith('0x') ? address.slice(2) : address;
  const padded = hex.padStart(64, '0');
  return `0x${padded.slice(0, 4)}…${padded.slice(-4)}`;
}
