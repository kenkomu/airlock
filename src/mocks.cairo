// SPDX-License-Identifier: MIT

//! Test-only doubles. The contract under test is always the real one.
//!
//! `MockPool` is the important one: it replicates the assertions the real pool
//! makes in `privacy::privacy::_apply_invoke_and_deposits` and
//! `_deposit_to_open_note`. Testing against a permissive mock would prove only
//! that the contract does not crash; testing against the pool's actual rules
//! proves the returned span would survive a real transaction.

use starknet::ContractAddress;

// ---------------------------------------------------------------- ERC20

#[starknet::interface]
pub trait IMockErc20<T> {
    fn approve(ref self: T, spender: ContractAddress, amount: u256) -> bool;
    fn balance_of(self: @T, account: ContractAddress) -> u256;
    fn allowance(self: @T, owner: ContractAddress, spender: ContractAddress) -> u256;
    fn transfer(ref self: T, to: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: T, from: ContractAddress, to: ContractAddress, amount: u256,
    ) -> bool;
    // Test controls.
    fn mint(ref self: T, to: ContractAddress, amount: u256);
    fn last_approval_spender(self: @T) -> ContractAddress;
    fn last_approval_amount(self: @T) -> u256;
    fn approval_count(self: @T) -> u32;
}

/// A real enough ERC20: balances, allowances, and a `transfer_from` that
/// actually debits the allowance, because that is how the pool collects.
#[starknet::contract]
pub mod MockErc20 {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
        last_spender: ContractAddress,
        last_amount: u256,
        approvals: u32,
    }

    #[abi(embed_v0)]
    impl MockErc20Impl of super::IMockErc20<ContractState> {
        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let owner = get_caller_address();
            self.allowances.write((owner, spender), amount);
            self.last_spender.write(spender);
            self.last_amount.write(amount);
            self.approvals.write(self.approvals.read() + 1);
            true
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }

        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress,
        ) -> u256 {
            self.allowances.read((owner, spender))
        }

        fn transfer(ref self: ContractState, to: ContractAddress, amount: u256) -> bool {
            let from = get_caller_address();
            let balance = self.balances.read(from);
            assert(balance >= amount, 'INSUFFICIENT_BALANCE');
            self.balances.write(from, balance - amount);
            self.balances.write(to, self.balances.read(to) + amount);
            true
        }

        fn transfer_from(
            ref self: ContractState, from: ContractAddress, to: ContractAddress, amount: u256,
        ) -> bool {
            let spender = get_caller_address();
            let allowed = self.allowances.read((from, spender));
            assert(allowed >= amount, 'INSUFFICIENT_ALLOWANCE');
            let balance = self.balances.read(from);
            assert(balance >= amount, 'INSUFFICIENT_BALANCE');
            self.allowances.write((from, spender), allowed - amount);
            self.balances.write(from, balance - amount);
            self.balances.write(to, self.balances.read(to) + amount);
            true
        }

        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            self.balances.write(to, self.balances.read(to) + amount);
        }
        fn last_approval_spender(self: @ContractState) -> ContractAddress {
            self.last_spender.read()
        }
        fn last_approval_amount(self: @ContractState) -> u256 {
            self.last_amount.read()
        }
        fn approval_count(self: @ContractState) -> u32 {
            self.approvals.read()
        }
    }
}

// ---------------------------------------------------------------- pool

#[starknet::interface]
pub trait IMockPool<T> {
    /// Run the sequence a real transaction runs: withdraw to the anonymizer,
    /// open `note_count` notes, invoke, then apply the returned deposits under
    /// the pool's own rules.
    fn run_cycle(
        ref self: T, anonymizer: ContractAddress, amount: u128, note_count: u32,
    ) -> u32;
    /// Same cycle, but with caller-chosen note ids, so a malformed id list can
    /// be driven through the pool's own checks.
    fn run_cycle_with_ids(
        ref self: T, anonymizer: ContractAddress, amount: u128, note_ids: Span<felt252>,
    ) -> u32;
    fn note_amount(self: @T, note_id: felt252) -> u128;
    fn notes_filled(self: @T) -> u32;
    fn collected(self: @T) -> u256;
}

/// Replicates the pool's consumption of an anonymizer's return value.
///
/// Deliberately mirrors `_deposit_to_open_note` assertion for assertion, with
/// the same error constants, so a failure here is the failure that would happen
/// on chain rather than an approximation of it.
#[starknet::contract]
pub mod MockPool {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_contract_address};
    use privacy::objects::OpenNoteDeposit;
    use super::{IMockErc20Dispatcher, IMockErc20DispatcherTrait};

    #[starknet::interface]
    trait IInvokable<T> {
        fn privacy_invoke(
            ref self: T, amount: u128, note_ids: Span<felt252>,
        ) -> Span<OpenNoteDeposit>;
    }

    #[storage]
    struct Storage {
        token: ContractAddress,
        /// note_id -> amount. Zero means open and unfilled.
        notes: Map<felt252, u128>,
        /// note_id -> exists.
        opened: Map<felt252, bool>,
        filled: u32,
        collected: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState, token: ContractAddress) {
        self.token.write(token);
    }

    #[abi(embed_v0)]
    impl MockPoolImpl of super::IMockPool<ContractState> {
        fn run_cycle(
            ref self: ContractState,
            anonymizer: ContractAddress,
            amount: u128,
            note_count: u32,
        ) -> u32 {
            let token = self.token.read();
            let erc20 = IMockErc20Dispatcher { contract_address: token };

            // Phase: withdraw. The pool sends the funds to the anonymizer before
            // invoking it — phase order is withdraw < invoke.
            erc20.transfer(anonymizer, amount.into());

            // Phase: open notes. The client's action list creates these, and the
            // pool counts them so it can assert every one is filled.
            let mut note_ids: Array<felt252> = array![];
            let mut undeposited: u32 = 0;
            let mut i: u32 = 0;
            while i != note_count {
                let id: felt252 = (i + 1).into();
                self.opened.write(id, true);
                self.notes.write(id, 0);
                note_ids.append(id);
                undeposited += 1;
                i += 1;
            }

            // Phase: invoke.
            let deposits = IInvokableDispatcher { contract_address: anonymizer }
                .privacy_invoke(amount, note_ids.span());

            // The pool's own accounting, assertion for assertion.
            assert(deposits.len() <= undeposited, 'TOO_MANY_OPEN_NOTES_DEPOSITED');
            undeposited -= deposits.len();

            for deposit in deposits {
                let OpenNoteDeposit { note_id, token: dep_token, amount: dep_amount } = *deposit;
                assert(dep_token.into() != 0_felt252, 'ZERO_TOKEN');
                assert(dep_amount != 0, 'ZERO_AMOUNT');
                assert(self.opened.read(note_id), 'NOTE_NOT_FOUND');
                assert(self.notes.read(note_id) == 0, 'NOTE_ALREADY_DEPOSITED');
                assert(dep_token == token, 'TOKEN_MISMATCH');

                self.notes.write(note_id, dep_amount);
                self.filled.write(self.filled.read() + 1);

                // The pool pulls, rather than the anonymizer pushing.
                erc20
                    .transfer_from(anonymizer, get_contract_address(), dep_amount.into());
                self.collected.write(self.collected.read() + dep_amount.into());
            }

            // The assertion that makes leg count a liveness property.
            assert(undeposited == 0, 'UNDEPOSITED_OPEN_NOTES');
            deposits.len()
        }

        fn run_cycle_with_ids(
            ref self: ContractState,
            anonymizer: ContractAddress,
            amount: u128,
            note_ids: Span<felt252>,
        ) -> u32 {
            let token = self.token.read();
            let erc20 = IMockErc20Dispatcher { contract_address: token };
            erc20.transfer(anonymizer, amount.into());

            // One open note per *distinct* id, which is what the real pool would
            // have: ids identify storage slots, so a repeated id is one note.
            let mut undeposited: u32 = 0;
            for id in note_ids {
                if !self.opened.read(*id) {
                    self.opened.write(*id, true);
                    self.notes.write(*id, 0);
                    undeposited += 1;
                }
            }

            let deposits = IInvokableDispatcher { contract_address: anonymizer }
                .privacy_invoke(amount, note_ids);

            assert(deposits.len() <= undeposited, 'TOO_MANY_OPEN_NOTES_DEPOSITED');
            undeposited -= deposits.len();

            for deposit in deposits {
                let OpenNoteDeposit { note_id, token: dep_token, amount: dep_amount } = *deposit;
                assert(dep_token.into() != 0_felt252, 'ZERO_TOKEN');
                assert(dep_amount != 0, 'ZERO_AMOUNT');
                assert(self.opened.read(note_id), 'NOTE_NOT_FOUND');
                assert(self.notes.read(note_id) == 0, 'NOTE_ALREADY_DEPOSITED');
                assert(dep_token == token, 'TOKEN_MISMATCH');
                self.notes.write(note_id, dep_amount);
                self.filled.write(self.filled.read() + 1);
                erc20.transfer_from(anonymizer, get_contract_address(), dep_amount.into());
                self.collected.write(self.collected.read() + dep_amount.into());
            }

            assert(undeposited == 0, 'UNDEPOSITED_OPEN_NOTES');
            deposits.len()
        }

        fn note_amount(self: @ContractState, note_id: felt252) -> u128 {
            self.notes.read(note_id)
        }
        fn notes_filled(self: @ContractState) -> u32 {
            self.filled.read()
        }
        fn collected(self: @ContractState) -> u256 {
            self.collected.read()
        }
    }
}
