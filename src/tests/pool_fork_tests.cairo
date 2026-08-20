// SPDX-License-Identifier: MIT

//! The **real pool**, calling **our contract**.
//!
//! This is the claim the rest of the suite could not reach. Every other test
//! runs `MockPool` — code I wrote by reading the pool's source — so it shares an
//! author with the contract under test and cannot disprove a misreading. The
//! existing fork tests narrowed that gap but stopped at the same wall, and said
//! so: the pool's entry point is behind a proof a fork cannot produce.
//!
//! That turned out to be wrong, and it is worth being precise about why, because
//! it is the whole reason this file can exist. `Privacy::validate_proof` does not
//! verify a proof. It reads `tx_info.proof_facts` — a transaction-level field the
//! sequencer populates — and asserts five properties of it: the program variant,
//! the output version, that the base block is recent, and that the L1 message
//! hash equals `compute_message_hash(actions, pool)`. The cryptography happens
//! outside the contract; the contract trusts the field. `snforge` can set that
//! field. So the real entry point is reachable, and every assertion the pool
//! makes about our return value runs for real.
//!
//! What this buys, and it is the thing that was missing: the deployed pool
//! bytecode performs the `call_contract_syscall` into our deployed bucketer,
//! deserializes what we hand back as `Span<OpenNoteDeposit>`, and runs its own
//! accounting over it — the open-note counter, `TOO_MANY_OPEN_NOTES_DEPOSITED`,
//! `UNDEPOSITED_OPEN_NOTES`, and the `transfer_from` out of our contract.
//!
//! What it still does not buy, and must not be claimed to: the wallet is absent.
//! A wallet turns `STRK20_ACTION[]` into this `Span<ServerAction>`, and that
//! translation is assumed here rather than tested. A real round trip remains the
//! only thing that closes it.

use core::poseidon::poseidon_hash_span;
use privacy::actions::ServerAction;
use privacy::interface::{IServerDispatcher, IServerDispatcherTrait};
use privacy::utils::ProofFacts;
use privacy::utils::constants::{VIRTUAL_SNOS, VIRTUAL_SNOS0};
use crate::bucketer::{IERC20Dispatcher, IERC20DispatcherTrait};
use privacy::actions::{InvokeInput, TransferToInput, WriteOnceInput};
use snforge_std::{
    CheatSpan, cheat_caller_address, load, map_entry_address, start_cheat_proof_facts,
    stop_cheat_proof_facts,
};
use starknet::syscalls::get_class_hash_at_syscall;
use starknet::{ContractAddress, SyscallResultTrait};

fn pool() -> ContractAddress {
    0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91.try_into().unwrap()
}

fn strk() -> ContractAddress {
    0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d.try_into().unwrap()
}

/// The pool charges a flat 2 STRK per `apply_actions`, taken by `transfer_from`
/// against the CALLER — so the caller has to have approved it. Discovering that
/// cost one run: the first spike failed with "Insufficient ERC20 allowance",
/// which is itself the useful signal, since `collect_fee` runs only after
/// `validate_proof` has already passed.
const FEE: u256 = 2_000_000_000_000_000_000;

/// Holds ~92 STRK at the pinned block, which covers the pool's 2-STRK fee.
fn payer() -> ContractAddress {
    0x5c66f610289cb55ec63ac953a3c3cc1f3812438ddef444f73f026c468a15802.try_into().unwrap()
}

/// A byte-for-byte replica of `privacy::utils::compute_message_hash`, which is
/// `pub(crate)` and so cannot be imported. If the pool ever changes how it binds
/// a proof to an action list, this drifts and every test here fails loudly —
/// which is the correct outcome, because the drift would be real.
fn message_hash(actions: Span<ServerAction>, contract_address: ContractAddress) -> felt252 {
    let mut l1_message_data: Array<felt252> = array![contract_address.into(), 0];
    let mut payload = array![];
    let class_hash = get_class_hash_at_syscall(contract_address).unwrap_syscall();
    class_hash.serialize(ref payload);
    actions.serialize(ref payload);
    payload.serialize(ref l1_message_data);
    poseidon_hash_span(l1_message_data.span())
}

/// Proof facts the pool will accept for exactly this action list.
fn facts_for(actions: Span<ServerAction>) -> Span<felt252> {
    let facts = ProofFacts {
        proof_version: 0,
        program_variant: VIRTUAL_SNOS,
        virtual_program_hash: 0,
        starknet_os_output_version: VIRTUAL_SNOS0,
        // Must be strictly before the current block and within `proof_validity_blocks` (450).
        base_block_number: starknet::get_block_number() - 1,
        base_block_hash: 0,
        starknet_os_config_hash: 0,
        message_to_l1_hashes: [message_hash(actions, pool())].span(),
    };
    let mut out = array![];
    facts.serialize(ref out);
    out.span()
}

/// The spike: is the real pool's entry point reachable at all?
///
/// Deliberately an EMPTY action list. Nothing is transferred, nothing is
/// emitted, nothing is invoked — so if this passes, it passes because
/// `validate_proof` accepted constructed proof facts and for no other reason.
/// Everything else is built on top of this one fact.
#[test]
#[fork("SEPOLIA")]
fn the_real_pool_accepts_a_call_we_can_construct() {
    let actions: Span<ServerAction> = [].span();

    approve_fee();

    start_cheat_proof_facts(pool(), facts_for(actions));
    cheat_caller_address(pool(), payer(), CheatSpan::TargetCalls(1));

    IServerDispatcher { contract_address: pool() }.apply_actions(actions, Option::None);

    stop_cheat_proof_facts(pool());
}

/// Lets the pool take its fee out of the payer, as a real caller would have to.
fn approve_fee() {
    cheat_caller_address(strk(), payer(), CheatSpan::TargetCalls(1));
    IERC20Dispatcher { contract_address: strk() }.approve(pool(), FEE);
}

/// The STRK bucketer, deployed and verified: 0.1-STRK rungs, wired to this pool.
fn bucketer() -> ContractAddress {
    0x00de39f79e7e8b0dcdafe955330e206990203d6047a22e853eab9df83c440e6b.try_into().unwrap()
}

/// `Note.packed_value` for a fresh open note: salt in the high 128 bits, amount
/// zero in the low. The pool asserts exactly this shape before it will accept a
/// deposit into the note (`NOTE_NOT_OPEN` / `NOTE_ALREADY_DEPOSITED`).
const OPEN_NOTE_PACKED_VALUE: felt252 = 0x100000000000000000000000000000000;

/// `ServerAction::EmitOpenNoteCreated`, built from its wire format.
///
/// It cannot be constructed directly: the event embeds `EncUserAddr`, which is
/// `pub(crate)` to the pool's package. Going through `Serde` sidesteps the
/// visibility and is the more faithful test anyway — these are the felts a
/// wallet would actually put on the wire, and the variant index is part of what
/// is being checked. Index 7 is `EmitOpenNoteCreated` in `ServerAction`.
///
/// The three zeros are the encrypted-recipient triple. The pool only re-emits
/// this event, so their contents are inert here; what matters is that each one
/// increments the pool's `undeposited_open_notes` counter.
fn emit_open_note(token: ContractAddress, note_id: felt252) -> ServerAction {
    let mut raw = array![7, 0, 0, 0, token.into(), note_id];
    let mut span = raw.span();
    Serde::<ServerAction>::deserialize(ref span).expect('bad EmitOpenNoteCreated')
}

/// Creates the open note in the pool's own storage, exactly as the wallet's
/// `WriteOnce` action does. `_apply_write_once` asserts the slot is currently
/// zero, so a note id may be used once and never again.
fn write_open_note(token: ContractAddress, note_id: felt252) -> ServerAction {
    ServerAction::WriteOnce(
        WriteOnceInput {
            storage_address: map_entry_address(selector!("notes"), [note_id].span()),
            value: [OPEN_NOTE_PACKED_VALUE, token.into()].span(),
        },
    )
}

/// The whole round trip, against the deployed pool and the deployed bucketer.
///
/// 8.4 STRK splits into 5 + 2.5 + 0.5 + 0.1 + 0.1 + 0.1 + 0.1 — seven notes,
/// four distinct sizes, which exercises repeats as well as the ladder walk.
#[test]
#[fork("SEPOLIA")]
fn the_real_pool_routes_a_withdrawal_through_our_anonymizer() {
    let amount: u128 = 8_400_000_000_000_000_000;
    let ids: Span<felt252> = [
        0xa11c0c00000000000000000000000000000000000000000000000000000001, 0xa11c0c00000000000000000000000000000000000000000000000000000002, 0xa11c0c00000000000000000000000000000000000000000000000000000003, 0xa11c0c00000000000000000000000000000000000000000000000000000004, 0xa11c0c00000000000000000000000000000000000000000000000000000005,
        0xa11c0c00000000000000000000000000000000000000000000000000000006, 0xa11c0c00000000000000000000000000000000000000000000000000000007,
    ]
        .span();

    let mut actions: Array<ServerAction> = array![
        // The withdrawal leg: the pool sends the full amount to our contract.
        ServerAction::TransferTo(
            TransferToInput { to_addr: bucketer(), token: strk(), amount },
        ),
    ];
    // One open note per leg, created and announced, as a wallet expands
    // `{ type: transfer, amount: OPEN }`.
    for id in ids {
        actions.append(write_open_note(strk(), *id));
        actions.append(emit_open_note(strk(), *id));
    }
    // Finally the invoke. The pool calls `privacy_invoke` on our contract, and
    // whatever we return it will try to deposit into the notes above.
    let mut calldata: Array<felt252> = array![amount.into(), ids.len().into()];
    for id in ids {
        calldata.append(*id);
    }
    actions.append(
        ServerAction::Invoke(
            InvokeInput { contract_address: bucketer(), calldata: calldata.span() },
        ),
    );

    let actions = actions.span();
    approve_fee();
    start_cheat_proof_facts(pool(), facts_for(actions));
    cheat_caller_address(pool(), payer(), CheatSpan::TargetCalls(1));

    IServerDispatcher { contract_address: pool() }.apply_actions(actions, Option::None);

    stop_cheat_proof_facts(pool());

    // Not "it did not revert" — that would also pass if the pool had quietly
    // deposited nothing. Read the notes back out of the pool's storage and check
    // each one holds the leg the ladder says it should.
    let expected: Span<u128> = [
        5_000_000_000_000_000_000,
        2_500_000_000_000_000_000,
        500_000_000_000_000_000,
        100_000_000_000_000_000,
        100_000_000_000_000_000,
        100_000_000_000_000_000,
        100_000_000_000_000_000,
    ]
        .span();
    let mut i: u32 = 0;
    let mut total: u128 = 0;
    while i != ids.len() {
        let got = note_amount(*ids.at(i));
        assert!(got == *expected.at(i), "note {} holds {}, expected {}", i, got, *expected.at(i));
        total += got;
        i += 1;
    }
    assert!(total == amount, "the legs do not sum to the withdrawal");
}

/// Reads a note's deposited amount straight out of the pool's storage.
///
/// `packed_value` is the open-note salt in the high 128 bits and the amount in
/// the low, so the amount is the low half.
fn note_amount(note_id: felt252) -> u128 {
    let slot = map_entry_address(selector!("notes"), [note_id].span());
    let raw = load(pool(), slot, 1);
    let packed: u256 = (*raw.at(0)).into();
    packed.low
}

/// The pool's own accounting, not ours: every note announced in a transaction
/// must be filled before the end of it.
///
/// This is the invariant `MockPool` was written to imitate, and the one a
/// misreading would have hidden. Here the real pool enforces it — an eighth note
/// is announced that our contract will not fill, and the pool rejects the lot.
#[test]
#[fork("SEPOLIA")]
#[should_panic(expected: 'UNDEPOSITED_OPEN_NOTES')]
fn the_real_pool_rejects_a_note_we_do_not_fill() {
    let amount: u128 = 8_400_000_000_000_000_000;
    let ids: Span<felt252> = [
        0xb0bb1e00000000000000000000000000000000000000000000000000000001,
        0xb0bb1e00000000000000000000000000000000000000000000000000000002,
        0xb0bb1e00000000000000000000000000000000000000000000000000000003,
        0xb0bb1e00000000000000000000000000000000000000000000000000000004,
        0xb0bb1e00000000000000000000000000000000000000000000000000000005,
        0xb0bb1e00000000000000000000000000000000000000000000000000000006,
        0xb0bb1e00000000000000000000000000000000000000000000000000000007,
    ]
        .span();
    let orphan: felt252 = 0xb0bb1e00000000000000000000000000000000000000000000000000000008;

    let mut actions: Array<ServerAction> = array![
        ServerAction::TransferTo(TransferToInput { to_addr: bucketer(), token: strk(), amount }),
    ];
    for id in ids {
        actions.append(write_open_note(strk(), *id));
        actions.append(emit_open_note(strk(), *id));
    }
    // The extra note. Nothing will deposit into it.
    actions.append(write_open_note(strk(), orphan));
    actions.append(emit_open_note(strk(), orphan));

    let mut calldata: Array<felt252> = array![amount.into(), ids.len().into()];
    for id in ids {
        calldata.append(*id);
    }
    actions
        .append(
            ServerAction::Invoke(
                InvokeInput { contract_address: bucketer(), calldata: calldata.span() },
            ),
        );

    let actions = actions.span();
    approve_fee();
    start_cheat_proof_facts(pool(), facts_for(actions));
    cheat_caller_address(pool(), payer(), CheatSpan::TargetCalls(1));

    IServerDispatcher { contract_address: pool() }.apply_actions(actions, Option::None);
}
