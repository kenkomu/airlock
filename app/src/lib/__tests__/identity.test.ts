/* Pinning the identity domain, because getting it wrong loses money silently.
 *
 * A derived account is a pure function of the message the user signed. If the
 * message changes, every existing user's signature derives a *different* account
 * — the old one still holds their funds, and nothing in the interface would look
 * broken. No exception, no failed transaction, just a balance that reads zero and
 * money nobody can reach through this app.
 *
 * That is a class of bug tests are unusually good at catching and code review is
 * unusually bad at: the diff looks like a copy edit. So the exact string is
 * asserted here byte for byte. If you are reading this because CI just failed,
 * the question is not "how do I update the fixture" — it is whether you meant to
 * strand every account derived before your change.
 */

import { describe, expect, it } from 'vitest';
import {
  AIRLOCK_IDENTITY_SIGN_MESSAGE,
  deriveIdentity,
  shortAddress,
} from '../identity';
import { MAX_VIEWING_KEY } from '../../../vendor/bridge-core/src/derivation/index';

/* An OpenZeppelin account class hash. The value only has to be a valid felt for
   these tests — address derivation folds it in, it is not dereferenced. */
const CLASS_HASH = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971ae';

/* Two arbitrary but fixed 65-byte secp256k1 signatures. Fixed, so every
   assertion below is reproducible. */
const SIG_A =
  '0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8' +
  '1b3d0e0dfa11e5b0d4e5b4a06d0b1d3bd8f7bfa63b8dda6dcbdc22e6ee3ae61c1b';
const SIG_B =
  '0x2d9bffa61796d3fe5cd4285f4583398c67ea628cad059238420b1ab8b47efbd9' +
  '2c4e1f1eab22f6c1e5f6c5b17e1c2e4ce9a8cab74c9eeb7edcec33f7ff4bf72c1c';

describe('AIRLOCK_IDENTITY_SIGN_MESSAGE', () => {
  it('is exactly this, and changing it orphans every existing account', () => {
    expect(AIRLOCK_IDENTITY_SIGN_MESSAGE).toBe(
      [
        'Airlock — derive your Starknet privacy keys',
        '',
        'Signing this proves you control this wallet. Airlock uses the signature to',
        'derive a Starknet account and a privacy-pool viewing key, here in your',
        'browser. The signature is not sent anywhere and nothing is stored.',
        '',
        'This is an off-chain signature. It is not a transaction and costs no gas.',
        '',
        'Version: 1',
      ].join('\n'),
    );
  });

  it('carries a version, so a deliberate migration has somewhere to happen', () => {
    /* Without a version line there is no way to roll the domain on purpose —
       every change would be indistinguishable from an accident. */
    expect(AIRLOCK_IDENTITY_SIGN_MESSAGE).toMatch(/^Version: \d+$/m);
  });

  it('is not StarkWare’s bridge message', () => {
    /* Domain separation. Sharing the signed message with another app would mean
       the same signature unlocks both, so a compromise of either reaches this
       one's funds. The opening line is what keeps them apart. */
    expect(AIRLOCK_IDENTITY_SIGN_MESSAGE).not.toContain(
      'Enter the privacy pool bridge',
    );
    expect(AIRLOCK_IDENTITY_SIGN_MESSAGE.split('\n')[0]).toContain('Airlock');
  });

  it('promises nothing the code does not do', () => {
    /* The message tells the user the signature is not sent anywhere and nothing
       is stored. `deriveIdentity` is synchronous and pure, so that claim is
       structurally true — but the wording is asserted here so the two cannot
       drift apart without a test failing. */
    expect(AIRLOCK_IDENTITY_SIGN_MESSAGE).toContain('not sent anywhere');
    expect(AIRLOCK_IDENTITY_SIGN_MESSAGE).toContain('costs no gas');
  });
});

describe('deriveIdentity', () => {
  it('is deterministic — the same signature always returns the same account', () => {
    /* This is the property the whole door rests on. A user with no Starknet
       wallet has nothing but this signature; if the derivation drifted, their
       funds would be gone. */
    const first = deriveIdentity(SIG_A, CLASS_HASH);
    const second = deriveIdentity(SIG_A, CLASS_HASH);
    expect(second.address).toBe(first.address);
    expect(second.publicKey).toBe(first.publicKey);
    expect(second.privateKey).toBe(first.privateKey);
    expect(second.viewingKey).toBe(first.viewingKey);
  });

  it('gives different wallets different accounts', () => {
    const a = deriveIdentity(SIG_A, CLASS_HASH);
    const b = deriveIdentity(SIG_B, CLASS_HASH);
    expect(a.address).not.toBe(b.address);
    expect(a.privateKey).not.toBe(b.privateKey);
    expect(a.viewingKey).not.toBe(b.viewingKey);
  });

  it('derives the spending key and the viewing key into unrelated values', () => {
    /* Both fold the same signature, and they must not collapse into each other:
       the viewing key is the one that can be escrowed to an auditor, and it must
       not be enough to spend. Domain-separation labels are what keep them apart,
       so this asserts the labels are actually doing their job. */
    const id = deriveIdentity(SIG_A, CLASS_HASH);
    expect(BigInt(id.privateKey)).not.toBe(id.viewingKey);
  });

  it('keeps the viewing key inside the curve bound', () => {
    /* Out of range is not a cosmetic problem — the pool rejects it, and the
       failure would land at transaction time rather than here. */
    for (const sig of [SIG_A, SIG_B]) {
      const { viewingKey } = deriveIdentity(sig, CLASS_HASH);
      expect(viewingKey).toBeGreaterThan(0n);
      expect(viewingKey).toBeLessThanOrEqual(MAX_VIEWING_KEY);
    }
  });

  it('changes the address when the account class changes', () => {
    /* The class hash is folded into the address. Deploying against a different
       account class therefore yields a different address from the same
       signature — worth pinning, because it means the class hash is part of the
       identity domain too, not just a deployment detail. */
    const other = '0x02b31e19e45c06f29234e06e2ee98a9966479ba3067f8785ed972794fdb0065c';
    expect(deriveIdentity(SIG_A, CLASS_HASH).address).not.toBe(
      deriveIdentity(SIG_A, other).address,
    );
  });

  it('returns a felt-shaped address', () => {
    const { address } = deriveIdentity(SIG_A, CLASS_HASH);
    expect(address).toMatch(/^0x[0-9a-f]{1,64}$/);
  });
});

describe('shortAddress', () => {
  it('pads a short address before truncating it', () => {
    /* Starknet addresses are felts and routinely come back with leading zeros
       stripped. Truncating the unpadded form shows the wrong leading digits —
       which defeats the point, since this string exists for the user to compare
       against another tool. */
    expect(shortAddress('0x1234')).toBe('0x0000…1234');
  });

  it('handles a full-width address', () => {
    const full = `0x${'ab'.repeat(32)}`;
    expect(shortAddress(full)).toBe('0xabab…abab');
  });

  it('accepts an address with no 0x prefix', () => {
    expect(shortAddress('1234')).toBe('0x0000…1234');
  });
});
