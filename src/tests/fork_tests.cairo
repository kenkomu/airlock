// SPDX-License-Identifier: MIT

//! The contract, against the real chain.
//!
//! Every other test in this suite runs against `MockErc20` and `MockPool` —
//! code I wrote by reading the pool's source. That is worth a great deal, but it
//! shares an author with the contract, so it cannot disprove a misreading. If I
//! misunderstood how the real STRK token handles an approval, my mock
//! misunderstands it identically and every test still passes.
//!
//! These tests fork Sepolia and run the **deployed** contract against the
//! **real** STRK token, with the pool's address as the caller. What that buys:
//!
//! - the real ERC20 accepts our `approve` and reports the allowance we expect,
//!   with whatever quirks the actual implementation has;
//! - the deployed bytecode — not a fresh local build — is what answers;
//! - `plan` and `denominations` come from the chain, so the ladder the client
//!   trusts is the ladder that is really there.
//!
//! What it does NOT buy: the pool never calls us here — these tests drive the
//! bucketer directly with the pool's address as the caller.
//!
//! This file used to claim that the pool COULD not call us on a fork, because
//! its entry point needed a STARK proof no fork can produce. That was wrong.
//! `validate_proof` does not verify a proof; it checks properties of
//! `tx_info.proof_facts`, a field `snforge` can set. `pool_fork_tests.cairo`
//! takes that route and gets the real pool to call this contract for real.
//!
//! Pinned to a block so the test is deterministic. It needs network access, so
//! it is excluded from the default run — see the `fork` profile.

use snforge_std::{start_cheat_caller_address, stop_cheat_caller_address};
use starknet::ContractAddress;
use crate::bucketer::{IAirlockBucketerDispatcher, IAirlockBucketerDispatcherTrait};
use crate::bucketer::{IERC20Dispatcher, IERC20DispatcherTrait};

/// The STRK deployment: 0.1-STRK rungs, 18 decimals.
fn bucketer() -> ContractAddress {
    0x00de39f79e7e8b0dcdafe955330e206990203d6047a22e853eab9df83c440e6b
        .try_into()
        .unwrap()
}

fn strk() -> ContractAddress {
    0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d
        .try_into()
        .unwrap()
}

fn pool() -> ContractAddress {
    0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91
        .try_into()
        .unwrap()
}

const UNIT: u128 = 100_000_000_000_000_000; // 0.1 STRK

#[test]
#[fork("SEPOLIA")]
fn the_deployed_contract_is_wired_to_the_real_pool_and_token() {
    let b = IAirlockBucketerDispatcher { contract_address: bucketer() };
    // Reading these off the chain rather than trusting the deploy log: a
    // constructor argument cannot be corrected later, so a wrong one is a dead
    // deployment and the client must never point at it.
    assert(b.pool() == pool(), 'WRONG_POOL');
    assert(b.token() == strk(), 'WRONG_TOKEN');
    assert(b.unit() == UNIT, 'WRONG_UNIT');
}

#[test]
#[fork("SEPOLIA")]
fn the_live_ladder_is_the_one_the_client_draws() {
    let b = IAirlockBucketerDispatcher { contract_address: bucketer() };
    let d = b.denominations();
    assert(d.len() == 9, 'LADDER_LEN');
    assert(*d.at(0) == 1000 * UNIT, 'TOP_RUNG');
    assert(*d.at(8) == UNIT, 'BOTTOM_RUNG');
}

#[test]
#[fork("SEPOLIA")]
fn the_deployed_contract_splits_as_the_client_expects() {
    let b = IAirlockBucketerDispatcher { contract_address: bucketer() };
    // 84.7 STRK on a 0.1 ladder: 50 + 25 + 5 + 2.5 + 1 + 1 + 0.1 + 0.1.
    let legs = b.plan(847 * UNIT);
    let mut total: u128 = 0;
    for l in legs {
        total += *l;
    }
    assert(total == 847 * UNIT, 'LEGS_MUST_SUM');
    assert(legs.len() == 8, 'LEG_COUNT');
}

#[test]
#[fork("SEPOLIA")]
#[should_panic(expected: 'NOT_ON_LADDER')]
fn the_deployed_contract_refuses_an_amount_off_the_ladder() {
    let b = IAirlockBucketerDispatcher { contract_address: bucketer() };
    // A figure with a hundredth of a STRK in it — below the bottom rung, so it
    // cannot be made from the ladder at any length.
    b.plan(847 * UNIT + 1);
}

#[test]
#[fork("SEPOLIA")]
#[should_panic(expected: 'CALLER_NOT_POOL')]
fn the_real_deployment_still_refuses_a_stranger() {
    // The access check, on the bytecode that is actually deployed rather than a
    // fresh local build of it. Anyone may call this entry point; only the pool
    // may get past the first line.
    let b = IAirlockBucketerDispatcher { contract_address: bucketer() };
    b.privacy_invoke(UNIT, array![1].span());
}

#[test]
#[fork("SEPOLIA")]
#[should_panic(expected: 'INSUFFICIENT_BALANCE')]
fn it_refuses_to_promise_what_it_does_not_hold() {
    // Impersonating the pool gets past access control, but the contract holds
    // no STRK on this fork, so it must refuse rather than approve value it
    // cannot deliver — the pool would then pull and revert the whole
    // transaction.
    let b = IAirlockBucketerDispatcher { contract_address: bucketer() };
    start_cheat_caller_address(bucketer(), pool());
    b.privacy_invoke(UNIT, array![1].span());
    stop_cheat_caller_address(bucketer());
}

#[test]
#[fork("SEPOLIA")]
fn the_real_token_accepts_our_approval() {
    // The point of this one. MockErc20 is my code; the real STRK token is not.
    // If I misread how approvals behave, the mock misreads it identically and
    // stays silent. Here the actual token answers.
    let token = IERC20Dispatcher { contract_address: strk() };
    let holder: ContractAddress = 0x1234.try_into().unwrap();
    let spender: ContractAddress = 0x5678.try_into().unwrap();

    start_cheat_caller_address(strk(), holder);
    token.approve(spender, 5 * UNIT.into());
    stop_cheat_caller_address(strk());

    // Reading the allowance back off the real contract, which is exactly the
    // pattern privacy_invoke relies on when it approves the pool.
    let erc20 = IAllowanceDispatcher { contract_address: strk() };
    assert(erc20.allowance(holder, spender) == (5 * UNIT).into(), 'ALLOWANCE_NOT_SET');
}

#[starknet::interface]
pub trait IAllowance<TContractState> {
    fn allowance(
        self: @TContractState, owner: ContractAddress, spender: ContractAddress,
    ) -> u256;
}
