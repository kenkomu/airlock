// SPDX-License-Identifier: MIT

//! Decomposition tests.
//!
//! The fixture table below is the contract between this contract and
//! `app/src/lib/buckets.ts`. `app/src/lib/__tests__/ladder.parity.test.ts` reads
//! the same cases, so a change to either implementation that is not made to both
//! fails here or there. That matters more than it looks: the pool requires every
//! open note created in a transaction to be filled, so a client planning `n`
//! legs against a contract producing `m` is not a cosmetic mismatch — it is a
//! transaction that always reverts.

use airlock_anonymizer::ladder::{MAX_LEGS, decompose};

/// 6-decimal USDC, the token this is deployed against first.
const USDC: u128 = 1_000_000;
/// An 18-decimal token, to prove the ladder is not secretly hard-coded to 1e6.
const WAD: u128 = 1_000_000_000_000_000_000;

fn sum(legs: @Array<u128>) -> u128 {
    let mut total = 0_u128;
    let mut i = 0_u32;
    while i != legs.len() {
        total += *legs.at(i);
        i += 1;
    }
    total
}

/// Every leg must be a real denomination — the property that makes a leg
/// indistinguishable from other people's legs, which is the entire point.
fn assert_all_on_ladder(legs: @Array<u128>, unit: u128) {
    let mut i = 0_u32;
    while i != legs.len() {
        let leg = *legs.at(i);
        let mut ok = false;
        for whole in [1000_u128, 500, 250, 100, 50, 25, 10, 5, 1].span() {
            if leg == *whole * unit {
                ok = true;
            }
        }
        assert!(ok, "leg {} is not a standard denomination", leg);
        i += 1;
    }
}

// ---------------------------------------------------------------- fixtures

/// THE SHARED TABLE. Keep in lockstep with the TypeScript fixture of the same
/// name. Each entry is (whole tokens, expected leg count).
fn fixtures() -> Array<(u128, u32)> {
    array![
        (1, 1), // the smallest denomination
        (5, 1),
        (10, 1),
        (1000, 1), // the largest
        (2000, 2), // above the ladder: repeats the top denomination
        (15, 2), // 10 + 5
        (35, 2), // 25 + 10
        (75, 2), // 50 + 25
        // 500+250+100+100+25+10+10+1+1+1+1. Eleven legs for a three-digit
        // amount is the case that justifies the interface warning about amounts
        // which splinter: bucketing 999 is legal and a bad idea.
        (999, 11),
        (847, 8), // 500+250+50+25+10+10+1+1 — the interface's default example
        (1250, 2), // 1000 + 250
        (3, 3), // 1+1+1 — legal but a poor plan, and the UI says so
    ]
}

#[test]
fn fixture_table_holds_for_usdc() {
    for case in fixtures().span() {
        let (whole, expected_legs) = *case;
        let amount = whole * USDC;
        let legs = decompose(amount, USDC);
        assert!(
            legs.len() == expected_legs,
            "amount {} gave {} legs, expected {}",
            whole,
            legs.len(),
            expected_legs,
        );
        assert!(sum(@legs) == amount, "legs do not sum to the amount for {}", whole);
        assert_all_on_ladder(@legs, USDC);
    }
}

#[test]
fn fixture_table_holds_for_an_18_decimal_token() {
    // Same leg counts, different unit: the ladder is defined in whole tokens and
    // scaled, so decimals cannot change how an amount is split.
    for case in fixtures().span() {
        let (whole, expected_legs) = *case;
        let legs = decompose(whole * WAD, WAD);
        assert!(legs.len() == expected_legs, "18-decimal leg count differs for {}", whole);
        assert!(sum(@legs) == whole * WAD, "18-decimal sum differs for {}", whole);
        assert_all_on_ladder(@legs, WAD);
    }
}

// ---------------------------------------------------------------- properties

#[test]
fn legs_always_sum_to_the_amount() {
    // Every bucketable whole amount from 1 to 400. Exhaustive beats sampled here:
    // the failure this guards against is value silently going missing.
    let mut whole = 1_u128;
    while whole != 401 {
        let legs = decompose(whole * USDC, USDC);
        assert!(sum(@legs) == whole * USDC, "value lost decomposing {}", whole);
        assert_all_on_ladder(@legs, USDC);
        whole += 1;
    }
}

#[test]
fn decomposition_is_greedy_and_therefore_minimal() {
    // 100 as one note, never 4 x 25 — fewer legs is both cheaper and less
    // distinctive, and greedy is optimal on this ladder.
    let legs = decompose(100 * USDC, USDC);
    assert!(legs.len() == 1, "100 should be a single leg");
    assert!(*legs.at(0) == 100 * USDC, "100 should be one 100 note");
}

#[test]
fn largest_denomination_comes_first() {
    let legs = decompose(1265 * USDC, USDC);
    assert!(*legs.at(0) == 1000 * USDC, "expected the 1000 leg first");
    assert!(*legs.at(1) == 250 * USDC, "expected the 250 leg second");
    // Descending order matters: it is what makes equal denominations adjacent,
    // which is what lets the interface group them as "10 x2".
    let mut i = 1_u32;
    while i != legs.len() {
        assert!(*legs.at(i - 1) >= *legs.at(i), "legs are not descending");
        i += 1;
    }
}

// ---------------------------------------------------------------- failure

#[test]
#[should_panic(expected: 'NOT_ON_LADDER')]
fn fractional_amounts_fail_closed() {
    // 847.32 USDC. The interface must floor to 847 and leave 0.32 in the pool;
    // if it ever passes the raw figure through, this revert is what stops the
    // contract from quietly moving a different amount than the user approved.
    decompose(847_320_000, USDC);
}

#[test]
#[should_panic(expected: 'NOT_ON_LADDER')]
fn dust_below_the_smallest_denomination_fails_closed() {
    decompose(USDC / 2, USDC);
}

#[test]
#[should_panic(expected: 'ZERO_AMOUNT')]
fn zero_is_rejected() {
    // The pool rejects zero-amount deposits anyway; failing here gives the caller
    // a named error instead of one from inside the pool.
    decompose(0, USDC);
}

#[test]
#[should_panic(expected: 'TOO_MANY_LEGS')]
fn absurd_amounts_are_capped() {
    // 25_000 needs 25 legs of 1000; the cap is 24. A withdrawal with that many
    // legs is its own fingerprint, so the contract refuses rather than producing
    // a "private" transfer nobody else could have made.
    decompose(25_000 * USDC, USDC);
}

#[test]
fn the_cap_is_reachable_but_not_exceeded() {
    let legs = decompose(24_000 * USDC, USDC);
    assert!(legs.len() == MAX_LEGS, "24_000 should sit exactly on the cap");
}
