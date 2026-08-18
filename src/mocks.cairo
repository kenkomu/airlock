// SPDX-License-Identifier: MIT

//! Test-only ERC20. The contract under test is the real one; only what it talks
//! to is mocked.
//!
//! It records the last `approve` because that is the security-critical output of
//! `privacy_invoke` we cannot otherwise observe: the pool pulls with
//! `transfer_from`, so an approval that is too large is a real finding and an
//! approval that is too small is a stuck transaction.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockErc20<T> {
    fn approve(ref self: T, spender: ContractAddress, amount: u256) -> bool;
    fn balance_of(self: @T, account: ContractAddress) -> u256;
    // Test controls.
    fn mint(ref self: T, to: ContractAddress, amount: u256);
    fn last_approval_spender(self: @T) -> ContractAddress;
    fn last_approval_amount(self: @T) -> u256;
    fn approval_count(self: @T) -> u32;
}

#[starknet::contract]
pub mod MockErc20 {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::ContractAddress;

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        last_spender: ContractAddress,
        last_amount: u256,
        approvals: u32,
    }

    #[abi(embed_v0)]
    impl MockErc20Impl of super::IMockErc20<ContractState> {
        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            self.last_spender.write(spender);
            self.last_amount.write(amount);
            self.approvals.write(self.approvals.read() + 1);
            true
        }
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
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
