// SPDX-License-Identifier: MIT

//! Contract-level tests for `AirlockBucketer`.
//!
//! The ERC20 is mocked; the contract under test is the real one. These cover the
//! things that are not arithmetic: who may call it, what it approves, what it
//! refuses, and whether a stranger can break it for everyone else.

use airlock_anonymizer::bucketer::{IAirlockBucketerDispatcher, IAirlockBucketerDispatcherTrait};
use airlock_anonymizer::mocks::{IMockErc20Dispatcher, IMockErc20DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

const USDC: u128 = 1_000_000;

fn pool() -> ContractAddress {
    'POOL'.try_into().unwrap()
}
fn stranger() -> ContractAddress {
    'STRANGER'.try_into().unwrap()
}

#[derive(Copy, Drop)]
struct Env {
    bucketer: ContractAddress,
    token: ContractAddress,
}

fn deploy() -> Env {
    let token_class = declare("MockErc20").unwrap().contract_class();
    let (token, _) = token_class.deploy(@array![]).unwrap();

    let class = declare("AirlockBucketer").unwrap().contract_class();
    let mut calldata = array![];
    pool().serialize(ref calldata);
    token.serialize(ref calldata);
    USDC.serialize(ref calldata);
    let (bucketer, _) = class.deploy(@calldata).unwrap();

    Env { bucketer, token }
}

/// Give the bucketer the funds the pool would have withdrawn to it.
fn fund(env: Env, whole: u128) {
    IMockErc20Dispatcher { contract_address: env.token }
        .mint(env.bucketer, (whole * USDC).into());
}

fn ids(n: u32) -> Span<felt252> {
    let mut out: Array<felt252> = array![];
    let mut i: u32 = 0;
    while i != n {
        out.append((i + 1).into());
        i += 1;
    }
    out.span()
}

// ---------------------------------------------------------------- access

#[test]
#[should_panic(expected: 'CALLER_NOT_POOL')]
fn a_stranger_cannot_invoke() {
    // The guard the entire contract rests on. Without it, anyone could make this
    // contract approve them for its balance.
    let env = deploy();
    fund(env, 100);
    start_cheat_caller_address(env.bucketer, stranger());
    IAirlockBucketerDispatcher { contract_address: env.bucketer }
        .privacy_invoke(100 * USDC, ids(1));
    stop_cheat_caller_address(env.bucketer);
}

#[test]
fn the_pool_can_invoke() {
    let env = deploy();
    fund(env, 100);
    start_cheat_caller_address(env.bucketer, pool());
    let out = IAirlockBucketerDispatcher { contract_address: env.bucketer }
        .privacy_invoke(100 * USDC, ids(1));
    stop_cheat_caller_address(env.bucketer);

    assert!(out.len() == 1, "expected one note");
    assert!(*out.at(0).amount == 100 * USDC, "wrong amount");
    assert!(*out.at(0).note_id == 1, "wrong note id");
    assert!(*out.at(0).token == env.token, "wrong token");
}

// ---------------------------------------------------------------- approval

#[test]
fn it_approves_the_pool_for_exactly_the_amount() {
    // Not unlimited, and not more than this call moves. An exact allowance means
    // a bug anywhere else cannot drain more than this transaction legitimately
    // withdrew — and the pool pulls it all back inside the same transaction, so
    // nothing survives the call.
    let env = deploy();
    fund(env, 847);
    start_cheat_caller_address(env.bucketer, pool());
    IAirlockBucketerDispatcher { contract_address: env.bucketer }
        .privacy_invoke(847 * USDC, ids(8));
    stop_cheat_caller_address(env.bucketer);

    let erc20 = IMockErc20Dispatcher { contract_address: env.token };
    assert!(erc20.last_approval_spender() == pool(), "approved the wrong spender");
    assert!(erc20.last_approval_amount() == (847 * USDC).into(), "approved the wrong amount");
    assert!(erc20.approval_count() == 1, "should approve exactly once");
}

#[test]
fn returned_amounts_sum_to_the_approval() {
    // If these ever diverge the pool either cannot pull everything it was
    // promised, or pulls more than we meant to give.
    let env = deploy();
    fund(env, 847);
    start_cheat_caller_address(env.bucketer, pool());
    let out = IAirlockBucketerDispatcher { contract_address: env.bucketer }
        .privacy_invoke(847 * USDC, ids(8));
    stop_cheat_caller_address(env.bucketer);

    let mut total: u128 = 0;
    let mut i: u32 = 0;
    while i != out.len() {
        total += *out.at(i).amount;
        i += 1;
    }
    assert!(total == 847 * USDC, "notes do not sum to the amount");
    assert!(
        IMockErc20Dispatcher { contract_address: env.token }
            .last_approval_amount() == total
            .into(),
        "approval does not match the notes",
    );
}

#[test]
fn note_ids_are_used_in_order() {
    // The pool matches our deposits to the notes the client created positionally.
    let env = deploy();
    fund(env, 1250);
    start_cheat_caller_address(env.bucketer, pool());
    let out = IAirlockBucketerDispatcher { contract_address: env.bucketer }
        .privacy_invoke(1250 * USDC, ids(2));
    stop_cheat_caller_address(env.bucketer);

    assert!(*out.at(0).note_id == 1 && *out.at(1).note_id == 2, "note ids out of order");
    assert!(*out.at(0).amount == 1000 * USDC, "largest denomination should be first");
    assert!(*out.at(1).amount == 250 * USDC, "second leg wrong");
}

// ---------------------------------------------------------------- failure

#[test]
#[should_panic(expected: 'LEG_COUNT_MISMATCH')]
fn a_plan_that_does_not_match_the_notes_is_refused() {
    // The pool asserts every open note it created gets filled and underflows if
    // we return more than exist. Both are reverts from inside the pool; catching
    // it here gives a named error the interface can actually explain.
    let env = deploy();
    fund(env, 847);
    start_cheat_caller_address(env.bucketer, pool());
    IAirlockBucketerDispatcher { contract_address: env.bucketer }
        .privacy_invoke(847 * USDC, ids(3));
    stop_cheat_caller_address(env.bucketer);
}

#[test]
#[should_panic(expected: 'INSUFFICIENT_BALANCE')]
fn it_refuses_to_promise_more_than_it_holds() {
    let env = deploy();
    fund(env, 10);
    start_cheat_caller_address(env.bucketer, pool());
    IAirlockBucketerDispatcher { contract_address: env.bucketer }
        .privacy_invoke(100 * USDC, ids(1));
    stop_cheat_caller_address(env.bucketer);
}

#[test]
#[should_panic(expected: 'NO_NOTES')]
fn an_empty_note_list_is_refused() {
    let env = deploy();
    fund(env, 100);
    start_cheat_caller_address(env.bucketer, pool());
    IAirlockBucketerDispatcher { contract_address: env.bucketer }
        .privacy_invoke(100 * USDC, ids(0));
    stop_cheat_caller_address(env.bucketer);
}

#[test]
#[should_panic(expected: 'NOT_ON_LADDER')]
fn an_unbucketable_amount_is_refused() {
    let env = deploy();
    fund(env, 848);
    start_cheat_caller_address(env.bucketer, pool());
    IAirlockBucketerDispatcher { contract_address: env.bucketer }
        .privacy_invoke(847_320_000, ids(8));
    stop_cheat_caller_address(env.bucketer);
}

// ---------------------------------------------------------------- griefing

#[test]
fn a_donation_cannot_break_it() {
    // The griefing vector this design exists to close. If the contract derived
    // the amount from `balance_of`, anyone could send it one unit of USDC and
    // every subsequent transaction would decompose differently, stop matching the
    // notes the client created, and revert — a denial of service costing an
    // attacker a millionth of a dollar.
    //
    // Because the amount is declared by the caller, the surplus is inert.
    let env = deploy();
    fund(env, 847);
    IMockErc20Dispatcher { contract_address: env.token }.mint(env.bucketer, 1); // the dust

    start_cheat_caller_address(env.bucketer, pool());
    let out = IAirlockBucketerDispatcher { contract_address: env.bucketer }
        .privacy_invoke(847 * USDC, ids(8));
    stop_cheat_caller_address(env.bucketer);

    assert!(out.len() == 8, "a donation changed the plan");
    assert!(
        IMockErc20Dispatcher { contract_address: env.token }
            .last_approval_amount() == (847 * USDC)
            .into(),
        "a donation changed the approval",
    );
}

#[test]
fn leftover_balance_is_never_given_away() {
    // Related to the above: surplus sitting in the contract must not be swept
    // into someone's notes. Only what the caller declared moves.
    let env = deploy();
    fund(env, 1000); // twice what will be moved
    start_cheat_caller_address(env.bucketer, pool());
    let out = IAirlockBucketerDispatcher { contract_address: env.bucketer }
        .privacy_invoke(500 * USDC, ids(1));
    stop_cheat_caller_address(env.bucketer);

    assert!(*out.at(0).amount == 500 * USDC, "moved more than declared");
    assert!(
        IMockErc20Dispatcher { contract_address: env.token }
            .last_approval_amount() == (500 * USDC)
            .into(),
        "approved more than declared",
    );
}

// ---------------------------------------------------------------- views

#[test]
fn the_ladder_is_readable_from_the_chain() {
    // The interface must be able to verify the split it previews against the
    // split the contract will actually produce, rather than assuming they agree.
    let env = deploy();
    let d = IAirlockBucketerDispatcher { contract_address: env.bucketer }.denominations();
    assert!(d.len() == 9, "expected nine denominations");
    assert!(*d.at(0) == 1000 * USDC, "largest should be first");
    assert!(*d.at(8) == USDC, "smallest should be last");
}

#[test]
fn plan_previews_without_spending() {
    let env = deploy();
    // No funding, no caller cheat: a view anyone may call.
    let legs = IAirlockBucketerDispatcher { contract_address: env.bucketer }.plan(847 * USDC);
    assert!(legs.len() == 8, "preview disagrees with the decomposition");
}

#[test]
fn config_is_exposed() {
    let env = deploy();
    let d = IAirlockBucketerDispatcher { contract_address: env.bucketer };
    assert!(d.pool() == pool(), "pool not exposed");
    assert!(d.token() == env.token, "token not exposed");
    assert!(d.unit() == USDC, "unit not exposed");
}
