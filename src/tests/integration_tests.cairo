// SPDX-License-Identifier: MIT

//! End-to-end against a pool that enforces the real pool's rules.
//!
//! The unit tests prove the contract does what I intended. These prove the
//! intention was right: that a span returned by `privacy_invoke` survives
//! `_apply_invoke_and_deposits` and `_deposit_to_open_note` unchanged, that the
//! approval covers exactly what the pool pulls, and that the transaction
//! balances to zero afterwards.
//!
//! `MockPool` mirrors the pool assertion for assertion with the same error
//! constants, so a failure here is the failure that would happen on chain.

use airlock_anonymizer::mocks::{
    IMockErc20Dispatcher, IMockErc20DispatcherTrait, IMockPoolDispatcher, IMockPoolDispatcherTrait,
};
use snforge_std::{ContractClassTrait, DeclareResultTrait, declare};
use starknet::ContractAddress;

const USDC: u128 = 1_000_000;

#[derive(Copy, Drop)]
struct Env {
    pool: ContractAddress,
    bucketer: ContractAddress,
    token: ContractAddress,
}

fn deploy() -> Env {
    let token_class = declare("MockErc20").unwrap().contract_class();
    let (token, _) = token_class.deploy(@array![]).unwrap();

    let pool_class = declare("MockPool").unwrap().contract_class();
    let mut pool_calldata = array![];
    token.serialize(ref pool_calldata);
    let (pool, _) = pool_class.deploy(@pool_calldata).unwrap();

    let class = declare("AirlockBucketer").unwrap().contract_class();
    let mut calldata = array![];
    pool.serialize(ref calldata);
    token.serialize(ref calldata);
    USDC.serialize(ref calldata);
    let (bucketer, _) = class.deploy(@calldata).unwrap();

    // The pool holds the users' funds, as the real one does.
    IMockErc20Dispatcher { contract_address: token }.mint(pool, (1_000_000 * USDC).into());

    Env { pool, bucketer, token }
}

/// One full cycle, asserting the invariants that matter afterwards.
fn cycle(env: Env, whole: u128, notes: u32) -> u32 {
    IMockPoolDispatcher { contract_address: env.pool }
        .run_cycle(env.bucketer, whole * USDC, notes)
}

// ---------------------------------------------------------------- happy path

#[test]
fn a_full_cycle_completes_and_balances() {
    let env = deploy();
    let erc20 = IMockErc20Dispatcher { contract_address: env.token };
    let pool = IMockPoolDispatcher { contract_address: env.pool };

    let legs = cycle(env, 847, 8);
    assert!(legs == 8, "expected eight legs");

    // Every note filled, and the amounts are the ladder decomposition.
    assert!(pool.notes_filled() == 8, "not every note was filled");
    assert!(pool.note_amount(1) == 500 * USDC, "leg 1");
    assert!(pool.note_amount(2) == 250 * USDC, "leg 2");
    assert!(pool.note_amount(3) == 50 * USDC, "leg 3");
    assert!(pool.note_amount(4) == 25 * USDC, "leg 4");
    assert!(pool.note_amount(5) == 10 * USDC, "leg 5");
    assert!(pool.note_amount(6) == 10 * USDC, "leg 6");
    assert!(pool.note_amount(7) == 1 * USDC, "leg 7");
    assert!(pool.note_amount(8) == 1 * USDC, "leg 8");

    // The pool collected exactly what it withdrew.
    assert!(pool.collected() == (847 * USDC).into(), "pool collected the wrong total");

    // And the anonymizer kept nothing. A bucketing contract that retains dust
    // every cycle is a slow leak of other people's money.
    assert!(erc20.balance_of(env.bucketer) == 0, "anonymizer retained funds");

    // No allowance survives the transaction.
    assert!(erc20.allowance(env.bucketer, env.pool) == 0, "a live allowance survived");
}

#[test]
fn a_single_denomination_round_trips() {
    let env = deploy();
    let pool = IMockPoolDispatcher { contract_address: env.pool };
    assert!(cycle(env, 1000, 1) == 1, "expected one leg");
    assert!(pool.note_amount(1) == 1000 * USDC, "wrong amount");
    assert!(
        IMockErc20Dispatcher { contract_address: env.token }.balance_of(env.bucketer) == 0,
        "retained funds",
    );
}

#[test]
fn the_worst_case_under_a_thousand_round_trips() {
    // 999 splinters into eleven legs. It is a legal plan and a bad one, and the
    // point of running it is that the contract must not fall over on the shape
    // it handles worst.
    let env = deploy();
    let pool = IMockPoolDispatcher { contract_address: env.pool };
    assert!(cycle(env, 999, 11) == 11, "expected eleven legs");
    assert!(pool.collected() == (999 * USDC).into(), "collected the wrong total");
    assert!(
        IMockErc20Dispatcher { contract_address: env.token }.balance_of(env.bucketer) == 0,
        "retained funds",
    );
}

#[test]
fn the_leg_cap_round_trips() {
    let env = deploy();
    let pool = IMockPoolDispatcher { contract_address: env.pool };
    assert!(cycle(env, 24_000, 24) == 24, "expected the cap");
    assert!(pool.collected() == (24_000 * USDC).into(), "collected the wrong total");
}

#[test]
fn consecutive_cycles_do_not_interfere() {
    // The contract holds no state between calls. If a cycle ever left dust or a
    // stale allowance behind, the second cycle is where it would surface.
    let env = deploy();
    let erc20 = IMockErc20Dispatcher { contract_address: env.token };
    let pool = IMockPoolDispatcher { contract_address: env.pool };

    cycle(env, 100, 1);
    assert!(erc20.balance_of(env.bucketer) == 0, "dust after the first cycle");
    cycle(env, 847, 8);
    assert!(erc20.balance_of(env.bucketer) == 0, "dust after the second cycle");
    cycle(env, 5, 1);
    assert!(erc20.balance_of(env.bucketer) == 0, "dust after the third cycle");

    assert!(pool.notes_filled() == 10, "expected ten notes across three cycles");
    assert!(pool.collected() == (952 * USDC).into(), "totals do not add up");
}

// ---------------------------------------------------------------- rejection

#[test]
#[should_panic(expected: 'LEG_COUNT_MISMATCH')]
fn too_few_notes_is_caught_before_the_pool_sees_it() {
    // The pool would revert with UNDEPOSITED_OPEN_NOTES. Catching it in the
    // anonymizer turns an opaque pool error into one the interface can explain.
    let env = deploy();
    cycle(env, 847, 4);
}

#[test]
#[should_panic(expected: 'LEG_COUNT_MISMATCH')]
fn too_many_notes_is_caught_before_the_pool_underflows() {
    let env = deploy();
    cycle(env, 847, 12);
}

#[test]
#[should_panic(expected: 'NOT_ON_LADDER')]
fn an_unbucketable_amount_never_reaches_the_pool() {
    let env = deploy();
    IMockPoolDispatcher { contract_address: env.pool }
        .run_cycle(env.bucketer, 847_320_000, 8);
}

#[test]
fn a_donation_does_not_disturb_a_real_cycle() {
    // The griefing vector, end to end. An attacker sends the anonymizer one unit
    // of USDC; every subsequent cycle must still complete.
    let env = deploy();
    let erc20 = IMockErc20Dispatcher { contract_address: env.token };
    erc20.mint(env.bucketer, 1);

    assert!(cycle(env, 847, 8) == 8, "a donation broke the cycle");
    assert!(
        IMockPoolDispatcher { contract_address: env.pool }.collected() == (847 * USDC).into(),
        "the pool collected the wrong total",
    );
    // The dust stays where it was — untouched and inert.
    assert!(erc20.balance_of(env.bucketer) == 1, "the donation was swept");
}

// ---------------------------------------------------------------- malformed input

#[test]
#[should_panic(expected: 'TOO_MANY_OPEN_NOTES_DEPOSITED')]
fn duplicate_note_ids_fail_closed_at_the_pool() {
    // The anonymizer does not scan for duplicate ids, deliberately: ids come
    // from the wallet's `${openNoteIds[i]}` substitution rather than from a
    // user, and the pool cannot be made to accept them.
    //
    // Which guard catches it is worth recording, because it is not the obvious
    // one. A note id is a storage slot, so a repeated id is *one* note, not two
    // — the pool's open-note counter therefore sees fewer notes than the legs
    // we return, and `checked_sub` underflows before any per-note check runs.
    // NOTE_ALREADY_DEPOSITED is unreachable from this contract for the same
    // reason: we pair leg i with id i, so we can only emit a duplicate if we
    // were handed one, and the counter fires first.
    //
    // Either way the failure is closed: the transaction reverts rather than the
    // second leg overwriting the first and the difference going missing.
    let env = deploy();
    IMockPoolDispatcher { contract_address: env.pool }
        .run_cycle_with_ids(env.bucketer, 1250 * USDC, array![7, 7].span());
}

#[test]
fn arbitrary_note_ids_are_honoured_in_order() {
    // Real ids are pool-assigned felts, not 1..n. The contract must pair leg i
    // with id i whatever the ids are.
    let env = deploy();
    let pool = IMockPoolDispatcher { contract_address: env.pool };
    let legs = pool
        .run_cycle_with_ids(env.bucketer, 1250 * USDC, array![0x9f2c, 0x41ab].span());

    assert!(legs == 2, "expected two legs");
    assert!(pool.note_amount(0x9f2c) == 1000 * USDC, "first id got the wrong leg");
    assert!(pool.note_amount(0x41ab) == 250 * USDC, "second id got the wrong leg");
}
