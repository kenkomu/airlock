import { Open, } from "./interfaces.js"; // Assuming you moved interfaces
import { toBigInt } from "./utils/convert.js";
import { toHex } from "./utils/convert.js";
import { AddressMap } from "./utils/maps.js";
import { isAll } from "./utils/validation.js";
export class SimplePrivateTransfersImpl {
    inner;
    constructor(inner) {
        this.inner = inner;
    }
    get user() {
        return this.inner.user;
    }
    registry = {
        channels: new AddressMap(),
        notes: new AddressMap(),
    };
    deposit(token, amount) {
        return this.build(token).deposit({ amount }).execute();
    }
    withdraw(token, recipient, amount) {
        const builder = this.build(token);
        if (isAll(amount)) {
            // Withdraw all: send everything as surplus to recipient's public balance
            // TODO(Avi): no-op today — resolveNotes only enters a token into `balances` via
            // deposits/useNotes/withdraws/createNotes, so a bare surplusTo with no other action
            // on the token never selects notes or emits a withdraw. Needs a fix in internal/compiler.ts.
            return builder.surplusTo(recipient, true).execute();
        }
        // Withdraw specific amount: pay recipient publicly, keep surplus as a private note
        return builder.withdraw({ recipient, amount }).surplusTo(this.inner.user, false).execute();
    }
    transfer(token, recipient, amount) {
        const builder = this.build(token);
        if (isAll(amount)) {
            // Transfer all: send everything as surplus to recipient
            return builder.surplusTo(recipient, false).execute();
        }
        // Transfer specific amount: send amount to recipient, keep surplus
        return builder.transfer({ recipient, amount }).surplusTo(this.inner.user, false).execute();
    }
    swap(fromToken, fromAmount, toToken, executor) {
        const toTokenAddress = toBigInt(toToken);
        return this.build(fromToken)
            .withdraw({ recipient: executor, amount: fromAmount })
            .surplusTo(this.inner.user, false) // Keep ACE surplus as private note
            .with(toToken)
            .transfer({ recipient: this.inner.user, amount: Open })
            .done()
            .invoke(({ openNotes, withdrawals }) => {
            return {
                contractAddress: toHex(executor),
                calldata: [
                    withdrawals[0].token,
                    toTokenAddress,
                    withdrawals[0].amount,
                    openNotes[0].noteId,
                ],
            };
        })
            .execute();
    }
    build(token) {
        // Clear notes before refresh to avoid stale entries (already-spent notes)
        this.registry.notes.clear();
        return this.inner
            .build({
            autoDiscover: { notes: "refresh", channels: "refresh" },
            autoSetup: true,
            autoSelectNotes: "all",
            registry: this.registry,
        })
            .with(token);
    }
}
//# sourceMappingURL=simple-private-transfers.js.map