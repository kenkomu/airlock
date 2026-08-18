// SPDX-License-Identifier: MIT

//! The anonymizer the pool calls through `privacy_invoke`.
//!
//! What it does, in one sentence: the pool withdraws a bucketable amount to this
//! contract, and the contract hands it straight back as several open notes of
//! standard denominations, so that no note carries the user's actual figure.
//!
//! ## Why this is the whole product
//!
//! A withdrawal of 847.32 USDC is a 1:1 fingerprint against a deposit of 847.32
//! USDC no matter how sound the proofs are, because amounts are public on both
//! sides. Splitting into 500 + 250 + 50 + 25 + 10 + 10 + 1 + 1 means every leg
//! matches other people's legs of the same size.
//!
//! `privacy_invoke` returning `Span<OpenNoteDeposit>` — an array — is what makes
//! this possible. Returning several notes is not a workaround; it is the shape
//! the interface was built with.
//!
//! ## The invariants the pool enforces on us
//!
//! Read from `privacy::privacy::_apply_actions` and `_deposit_to_open_note`,
//! because getting any of these wrong is a reverted transaction at best:
//!
//! 1. **Every open note created in the transaction must be filled.** The pool
//!    counts `EmitOpenNoteCreated` and asserts the counter reaches zero. We must
//!    return exactly as many deposits as the client created notes — not fewer.
//! 2. **No more deposits than notes**, or `checked_sub` underflows.
//! 3. **No zero amounts and no zero token**; each is an explicit assert.
//! 4. **Each note must exist, be open, and be unfilled**, with a matching token.
//! 5. **The pool pulls with `transfer_from`**, so we must approve it first and
//!    must actually hold the funds.
//!
//! ## Security posture
//!
//! No owner, no upgrade path, no admin key, and no mutable storage. Everything
//! configurable is baked at construction, which means the attack surface is the
//! single entrypoint below. One deployment serves one token; serving another is
//! another deployment, which is also how the reference anonymizers do it.
//!
//! The contract never holds funds between transactions. The pool withdraws to it
//! and pulls back inside one atomic transaction, so a balance sitting here
//! outside a call is not ours and is not counted — see `amount` handling below.

use starknet::ContractAddress;
use privacy::objects::OpenNoteDeposit;

pub mod errors {
    pub const CALLER_NOT_POOL: felt252 = 'CALLER_NOT_POOL';
    pub const INSUFFICIENT_BALANCE: felt252 = 'INSUFFICIENT_BALANCE';
    pub const LEG_COUNT_MISMATCH: felt252 = 'LEG_COUNT_MISMATCH';
    pub const NO_NOTES: felt252 = 'NO_NOTES';
}

/// Minimal ERC20 surface. `approve` for handing value back to the pool,
/// `balance_of` to refuse a call we cannot actually cover.
#[starknet::interface]
pub trait IERC20<TContractState> {
    fn approve(ref self: TContractState, spender: ContractAddress, amount: u256) -> bool;
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
}

#[starknet::interface]
pub trait IAirlockBucketer<TContractState> {
    /// Pool-only. Decomposes `amount` into standard denominations and returns one
    /// `OpenNoteDeposit` per denomination, in the order of `note_ids`.
    ///
    /// `note_ids` arrive as the wallet's `${openNoteIds[i]}` placeholders, so the
    /// client decides how many notes exist and this contract must match exactly.
    fn privacy_invoke(
        ref self: TContractState, amount: u128, note_ids: Span<felt252>,
    ) -> Span<OpenNoteDeposit>;

    /// The ladder this deployment enforces, in base units, largest first. Exposed
    /// so a client can read its plan from the chain rather than assuming it — the
    /// interface must never show a split the contract would not produce.
    fn denominations(self: @TContractState) -> Span<u128>;

    /// Read-only decomposition, for previewing a plan without spending anything.
    fn plan(self: @TContractState, amount: u128) -> Span<u128>;

    fn pool(self: @TContractState) -> ContractAddress;
    fn token(self: @TContractState) -> ContractAddress;
    fn unit(self: @TContractState) -> u128;
}

#[starknet::contract]
pub mod AirlockBucketer {
    use core::num::traits::Zero;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use privacy::objects::OpenNoteDeposit;
    use crate::ladder::{LADDER, decompose};
    use super::{IAirlockBucketer, IERC20Dispatcher, IERC20DispatcherTrait, errors};

    /// All immutable. There is deliberately no setter for any of these: a
    /// bucketing contract whose ladder or pool can be changed after deployment
    /// is a contract whose users cannot verify what it will do to their funds.
    #[storage]
    struct Storage {
        pool: ContractAddress,
        token: ContractAddress,
        unit: u128,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Bucketed: Bucketed,
    }

    /// Emitted once per call. `legs` is the count, never the amounts — the
    /// per-note amounts are already public in the pool's own `OpenNoteDeposited`
    /// events, and re-emitting them here would add nothing but noise.
    #[derive(Drop, starknet::Event)]
    pub struct Bucketed {
        #[key]
        pub token: ContractAddress,
        pub amount: u128,
        pub legs: u32,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, pool: ContractAddress, token: ContractAddress, unit: u128,
    ) {
        assert(pool.is_non_zero(), 'ZERO_POOL');
        assert(token.is_non_zero(), 'ZERO_TOKEN');
        assert(unit.is_non_zero(), 'ZERO_UNIT');
        self.pool.write(pool);
        self.token.write(token);
        self.unit.write(unit);
    }

    #[abi(embed_v0)]
    pub impl AirlockBucketerImpl of IAirlockBucketer<ContractState> {
        fn privacy_invoke(
            ref self: ContractState, amount: u128, note_ids: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            // Only the pool. Everything downstream assumes the caller is the pool
            // — including that it is the pool which will pull the approval we are
            // about to grant — so this is the guard the whole contract rests on.
            let pool = self.pool.read();
            assert(get_caller_address() == pool, errors::CALLER_NOT_POOL);
            assert(note_ids.len().is_non_zero(), errors::NO_NOTES);

            let token = self.token.read();
            let erc20 = IERC20Dispatcher { contract_address: token };

            // Work from the caller-declared `amount`, not from our balance, and
            // check the balance covers it.
            //
            // Reading `balance_of` as the amount would let anyone grief this
            // contract by sending it a single unit of USDC: the decomposition
            // would shift, the leg count would stop matching the notes the client
            // created, and every transaction would revert until someone cleared
            // the dust. Declaring the amount makes the split a pure function of
            // the call, and a stray balance is inert.
            let balance: u256 = erc20.balance_of(get_contract_address());
            assert(balance >= amount.into(), errors::INSUFFICIENT_BALANCE);

            // Fails closed if `amount` is not an exact sum of denominations.
            let legs = decompose(amount, self.unit.read());

            // The pool asserts that every note created in this transaction gets
            // filled, and underflows if we return more than were created. Both
            // are reverts; checking here turns them into a named error instead of
            // an opaque one from inside the pool.
            assert(legs.len() == note_ids.len(), errors::LEG_COUNT_MISMATCH);

            // Approve exactly the total. The pool pulls it back within this same
            // transaction, so no allowance survives the call — and an exact
            // approval means a bug elsewhere cannot drain more than this call
            // legitimately moved.
            erc20.approve(spender: pool, amount: amount.into());

            let mut deposits: Array<OpenNoteDeposit> = array![];
            let mut i: u32 = 0;
            while i != legs.len() {
                deposits
                    .append(
                        OpenNoteDeposit { note_id: *note_ids.at(i), token, amount: *legs.at(i) },
                    );
                i += 1;
            }

            self.emit(Event::Bucketed(Bucketed { token, amount, legs: legs.len() }));
            deposits.span()
        }

        fn denominations(self: @ContractState) -> Span<u128> {
            let unit = self.unit.read();
            let mut out: Array<u128> = array![];
            for whole in LADDER.span() {
                out.append(*whole * unit);
            }
            out.span()
        }

        fn plan(self: @ContractState, amount: u128) -> Span<u128> {
            decompose(amount, self.unit.read()).span()
        }

        fn pool(self: @ContractState) -> ContractAddress {
            self.pool.read()
        }
        fn token(self: @ContractState) -> ContractAddress {
            self.token.read()
        }
        fn unit(self: @ContractState) -> u128 {
            self.unit.read()
        }
    }
}
