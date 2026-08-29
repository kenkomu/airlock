/* The account-deploy leg, against a real chain.
 *
 * `ensureDerivedAccountDeployed` is the first thing that runs in every deposit
 * and the last thing anyone would want to discover is broken: it spends the
 * user's own STRK, and it does so on an account that exists nowhere until the
 * transaction lands. Unit tests cannot reach any of that — the interesting
 * parts are an RPC that says "no class at this address", a fee estimate against
 * an undeployed account, and a signature over a payload only the sequencer
 * validates.
 *
 * So this test runs against Starknet Sepolia, for free, and it is skipped
 * everywhere by default. It never runs in CI and never runs on `pnpm test`
 * unless someone deliberately asks:
 *
 *   AIRLOCK_LIVE=1 \
 *   AIRLOCK_LIVE_FUNDER_ADDRESS=0x… \
 *   AIRLOCK_LIVE_FUNDER_KEY=0x… \
 *   pnpm vitest run src/lib/__tests__/deployAccount.live.test.ts
 *
 * The funder is a throwaway Sepolia account holding test STRK. Its key comes
 * from the environment and is never read from a file in this repository, never
 * defaulted, and never committed — the test fails closed if it is missing
 * rather than looking anywhere else for one.
 *
 * A fresh identity is generated on every run. That is the point: a reused one
 * would already be deployed after the first pass, and the branch that matters
 * is the first-time one.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';

const LIVE = process.env.AIRLOCK_LIVE === '1';
const FUNDER_ADDRESS = process.env.AIRLOCK_LIVE_FUNDER_ADDRESS ?? '';
const FUNDER_KEY = process.env.AIRLOCK_LIVE_FUNDER_KEY ?? '';

const SEPOLIA_RPC = 'https://api.cartridge.gg/x/starknet/sepolia';
const STRK_TOKEN = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

/* Sepolia is a shared public network and every step here is a round trip:
   a fee estimate, a transfer to wait on, a deploy to wait on. Two minutes is
   not slow, it is the honest cost of proving this on a real chain. */
const TIMEOUT = 180_000;

describe.skipIf(!LIVE)('ensureDerivedAccountDeployed, against Sepolia', () => {
  let identity: { address: string; publicKey: string; privateKey: string };
  let signature: string;
  let deposit: typeof import('../deposit');

  beforeAll(async () => {
    expect(
      FUNDER_ADDRESS && FUNDER_KEY,
      'AIRLOCK_LIVE_FUNDER_ADDRESS and AIRLOCK_LIVE_FUNDER_KEY must both be set',
    ).toBeTruthy();

    /* Point the module at Sepolia before it is imported — `bridgeRpcUrl` reads
       this at call time, but resetting modules first keeps this test honest
       about the import order the app itself uses. */
    vi.resetModules();
    vi.stubEnv('VITE_AIRLOCK_BRIDGE_NETWORK', 'testnet');
    deposit = await import('../deposit');

    /* A real signature over the real message, from a key that exists only for
       the length of this test. Faithful to what MetaMask hands the app: the
       same 65-byte 0x-hex shape, produced the same EIP-191 way. */
    const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts');
    const { AIRLOCK_IDENTITY_SIGN_MESSAGE, deriveIdentity, OZ_ACCOUNT_CLASS_HASH } =
      await import('../identity');

    const throwaway = privateKeyToAccount(generatePrivateKey());
    signature = await throwaway.signMessage({ message: AIRLOCK_IDENTITY_SIGN_MESSAGE });
    identity = deriveIdentity(signature, OZ_ACCOUNT_CLASS_HASH);
  }, TIMEOUT);

  it(
    'refuses, and says how much is short, before the account can pay for itself',
    async () => {
      /* The branch a first-time user hits: a derived address with nothing in
         it. This must fail before any signing happens, because the fix is on
         another screen and finding that out after a wallet prompt is worse. */
      await expect(deposit.ensureDerivedAccountDeployed(signature)).rejects.toThrow();

      const err = await deposit
        .ensureDerivedAccountDeployed(signature)
        .then(() => null)
        .catch((e: unknown) => e);

      const needsGas = deposit.asNeedsGas(err);
      expect(needsGas, 'an empty derived account must report AIRLOCK_DEPLOY_NEEDS_GAS').not.toBeNull();
      expect(needsGas!.address).toBe(identity.address);
      /* Nothing is held, so the whole threshold is outstanding. An off-by-one
         here would show the user the wrong figure to send. */
      expect(needsGas!.needWei).toBe(deposit.DEPLOY_GAS_WEI);
    },
    TIMEOUT,
  );

  it(
    'creates the account out of its own gas once funded',
    async () => {
      const { Account, RpcProvider, CallData, cairo } = await import('starknet');
      const provider = new RpcProvider({ nodeUrl: SEPOLIA_RPC });

      const funder = new Account({
        provider,
        address: FUNDER_ADDRESS,
        signer: FUNDER_KEY,
        cairoVersion: '1',
      });

      const { transaction_hash: fundTx } = await funder.execute({
        contractAddress: STRK_TOKEN,
        entrypoint: 'transfer',
        calldata: CallData.compile({
          recipient: identity.address,
          amount: cairo.uint256(deposit.DEPLOY_GAS_WEI),
        }),
      });
      await provider.waitForTransaction(fundTx);

      const statuses: string[] = [];
      const result = await deposit.ensureDerivedAccountDeployed(signature, (m) =>
        statuses.push(m),
      );

      expect(result.address).toBe(identity.address);
      expect(result.deployedNow, 'the account did not exist, so it must report a fresh deploy').toBe(true);
      expect(result.txHash).toBeTruthy();

      /* The class is now at the address — the only proof that matters, and the
         one the deposit's next step depends on. */
      const classHash = await provider.getClassHashAt(identity.address);
      const { OZ_ACCOUNT_CLASS_HASH } = await import('../identity');
      expect(BigInt(classHash)).toBe(BigInt(OZ_ACCOUNT_CLASS_HASH));

      /* Called a second time it must be a cheap no-op, not a second deploy —
         a resumed deposit runs this again. */
      const again = await deposit.ensureDerivedAccountDeployed(signature);
      expect(again.deployedNow).toBe(false);
      expect(again.txHash).toBeUndefined();

      /* Reported, not asserted: what the deploy actually cost is the number
         that decides whether DEPLOY_GAS_WEI is a fair thing to ask a user for
         on mainnet. */
      const receipt = await provider.getTransactionReceipt(result.txHash!);
      const fee = (receipt as { actual_fee?: { amount?: string } }).actual_fee?.amount;
      console.log(
        `\n  deployed ${identity.address}\n    tx      ${result.txHash}` +
          `\n    fee     ${fee ? `${BigInt(fee)} wei (${Number(BigInt(fee)) / 1e18} STRK)` : 'unknown'}` +
          `\n    asked   ${deposit.DEPLOY_GAS_WEI} wei (${Number(deposit.DEPLOY_GAS_WEI) / 1e18} STRK)` +
          `\n    status  ${statuses.join(' → ')}\n`,
      );
    },
    TIMEOUT,
  );

  it(
    'reaches the pool register step, and reports honestly what stops it',
    async () => {
      /* The deploy is only the first of three steps. This one asks the next
         question the deposit asks: with a deployed, gas-holding account, can
         the pool leg actually be submitted?
   
         `submitProvenCall` dispatches to the AVNU paymaster when one is
         configured and to a manager (admin) account otherwise. A production
         build has no admin by construction — `resolveAdmin` returns undefined
         whenever `prod` is set — so this records which of those two the app
         actually has, on the same config the app builds for itself. */
      const { initBridgeConfig, config } = await import(
        '../../../vendor/bridge-core/src/core/config'
      );
      /* The app's own vars, not a hand-written stand-in — a probe that builds
         its own config tests the probe, not the app. */
      initBridgeConfig({ dev: false, prod: true, vars: deposit.bridgeVars() });

      const { getManagerAccount } = await import(
        '../../../vendor/bridge-core/src/core/proven-submit'
      );

      const hasPaymaster = Boolean(config.paymaster);
      let managerError: string | null = null;
      try {
        getManagerAccount();
      } catch (e) {
        managerError = e instanceof Error ? e.message : String(e);
      }

      console.log(
        `\n  proven-leg payer, on the app's own production config:` +
          `\n    paymaster  ${hasPaymaster ? 'configured' : 'NOT configured'}` +
          `\n    manager    ${managerError ? `unavailable — ${managerError}` : 'available'}\n`,
      );

      /* Not a wish, a record. If either of these ever becomes available the
         assertion fails and someone re-reads this test — which is the point,
         because that is the day the pool leg starts working. */
      expect(hasPaymaster, 'no AVNU paymaster key is configured in this build').toBe(false);
      expect(managerError, 'a production build must have no admin manager').toMatch(
        /No manager \(admin\) account configured/,
      );
    },
    TIMEOUT,
  );
});
