/* The account class the derived address is computed against.
 *
 * This lives alone, in a module that imports nothing, because two separate
 * things need it and neither may be allowed to drift from the other:
 *
 *   - `identity.ts` folds it into the address, so it is part of the identity
 *     domain. Point it at a different class and the same signature derives a
 *     different address, leaving the old one holding the funds.
 *   - the bridge engine takes it as configuration (`ozClassHash`) and deploys
 *     against it. If the engine's value ever differed from the derivation's,
 *     the engine would act on an address the app never showed anyone — money
 *     sent to the displayed address would sit in an account the deposit does
 *     not touch.
 *
 * One constant, imported by both, is the only arrangement in which that
 * mismatch cannot happen. `deposit.test.ts` asserts the engine actually
 * receives this value.
 *
 * OpenZeppelin's account, the one StarkWare's own bridge deploys. A baked value
 * is only safe if the class is actually declared on chain — an address computed
 * against an undeclared class cannot be deployed to, and the failure arrives
 * after the user has funded it. Checked rather than assumed: `starknet_getClass`
 * returns it on Starknet mainnet and on Sepolia, and the hash is the same on
 * both, which is why one constant covers both networks. Proven end to end by
 * `deployAccount.live.test.ts`, which deploys against it on Sepolia and reads
 * the class back from the deployed address.
 */
export const OZ_ACCOUNT_CLASS_HASH =
  '0x5b4b537eaa2399e3aa99c4e2e0208ebd6c71bc1467938cd52c798c601e43564';
