// SPDX-License-Identifier: MIT

//! The denomination ladder and its decomposition, kept in their own module so
//! the arithmetic can be tested without deploying a contract.
//!
//! Powers of ten with a 5 and a 2.5 step — the ladder physical cash uses, for
//! the same reason: few enough distinct values that each one is crowded, fine
//! enough that what cannot be represented stays small.
//!
//! This must agree exactly with `app/src/lib/buckets.ts`. Not approximately:
//! the pool asserts that every open note created in a transaction is filled, so
//! a client that plans `n` notes while the contract decomposes into `m != n`
//! produces a transaction that reverts. The shared fixture table in `tests`
//! exists to keep the two implementations pinned to each other.

pub mod errors {
    pub const NOT_ON_LADDER: felt252 = 'NOT_ON_LADDER';
    pub const TOO_MANY_LEGS: felt252 = 'TOO_MANY_LEGS';
    pub const ZERO_AMOUNT: felt252 = 'ZERO_AMOUNT';
}

/// Denominations in whole tokens, descending. Descending order is what makes the
/// greedy walk optimal on this ladder — every denomination divides some larger
/// one, or is reachable by the 25/50 pair — so no dynamic programming is needed.
pub const LADDER: [u128; 9] = [1000, 500, 250, 100, 50, 25, 10, 5, 1];

/// Hard cap on legs per transaction.
///
/// Two reasons, and the second is the real one. Gas: the pool applies one
/// `transfer_from` per note, so cost is linear in leg count. Privacy: a
/// 40-leg withdrawal is itself a fingerprint, however standard each leg looks —
/// bucketing an amount into a pattern nobody else could produce defeats its own
/// purpose. Amounts needing more than this should be split across transactions
/// with rest periods between them, which is what the interface tells the user.
pub const MAX_LEGS: u32 = 24;

/// Greedily decompose `amount` (in token base units) into ladder denominations.
///
/// `unit` is one whole token in base units — 1_000_000 for 6-decimal USDC. It is
/// baked at deployment rather than passed by the caller, so the ladder a caller
/// gets is the ladder the deployment advertises.
///
/// Fails closed rather than approximating: an amount that is not an exact sum of
/// denominations reverts instead of silently leaving a remainder. Rounding here
/// would mean the contract quietly moving a different amount than the interface
/// showed, which on a privacy tool is the worst available failure.
pub fn decompose(amount: u128, unit: u128) -> Array<u128> {
    assert(amount != 0, errors::ZERO_AMOUNT);

    let mut legs: Array<u128> = array![];
    let mut remaining = amount;

    for whole in LADDER.span() {
        // `whole * unit` cannot overflow for any sane deployment: the largest
        // denomination is 1000 and u128 holds ~3.4e38, so this is safe up to
        // 35-decimal tokens. Cairo panics on overflow regardless.
        let denom = *whole * unit;
        while remaining >= denom {
            legs.append(denom);
            remaining -= denom;
            assert(legs.len() <= MAX_LEGS, errors::TOO_MANY_LEGS);
        }
    }

    assert(remaining == 0, errors::NOT_ON_LADDER);
    legs
}
