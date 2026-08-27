/**
 * Builder implementations for constructing private transfer operations.
 */
import { type CreateNoteAction, type DepositAction, type ExecuteOptions, type ExecuteResult, type Note, type OpenChannelAction, type OpenTokenChannelAction, type PrivateTransfersBuilder, type ProofInvocationResult, type SetViewingKeyAction, type StarknetAddress, type StarknetAddressBigint, type TokenOperationsBuilder, type UseNoteAction, type WithdrawAction, type WithdrawOutput, type DepositInput, type TransferOutput, type SurplusAction, type InvokeAction, type ComputeAndInvokeAction, type ComputeAndInvokeDetails, type InvokeCalldataBuilderArgs, type SimulateOptions, type ShadowAccountsBuilder, type ViewingKey, PrivateTransfersInterface } from "../interfaces.js";
import type { BigNumberish, CallDetails } from "starknet";
export declare class TokenOperationsBuilderImpl implements TokenOperationsBuilder {
    private parentBuilder;
    openTokenChannels: OpenTokenChannelAction[];
    useNotes: UseNoteAction[];
    deposits: DepositAction[];
    createNotes: CreateNoteAction[];
    withdraws: WithdrawAction[];
    surplusAction?: SurplusAction;
    readonly token: StarknetAddressBigint;
    constructor(parentBuilder: PrivateTransfersBuilderImpl, token: StarknetAddress);
    setup(recipient: StarknetAddress): this;
    inputs(...notes: Note[]): this;
    deposit(...inputs: DepositInput[]): this;
    withdraw(...outputs: WithdrawOutput[]): this;
    transfer(...outputs: TransferOutput[]): this;
    surplusTo(recipient: StarknetAddress, withdraw?: boolean): this;
    with(token: StarknetAddress): TokenOperationsBuilder;
    with(token: StarknetAddress, ops: (t: TokenOperationsBuilder) => void): this;
    done(): PrivateTransfersBuilder;
    execute(options?: ExecuteOptions): Promise<ExecuteResult>;
    createProofInvocation(options?: ExecuteOptions): Promise<ProofInvocationResult>;
    simulate(options: SimulateOptions): Promise<ExecuteResult>;
}
export declare class PrivateTransfersBuilderImpl implements PrivateTransfersBuilder {
    private transfers;
    readonly userAddress: StarknetAddress;
    private shadowAccountDeps?;
    setViewingKey?: SetViewingKeyAction;
    openChannels: OpenChannelAction[];
    invokeExternal?: InvokeAction;
    computeAndInvokeAction?: ComputeAndInvokeAction;
    tokenBuilders: import("../utils/maps.js").BigNumberishMap<TokenOperationsBuilderImpl>;
    defaultSurplusAction?: SurplusAction;
    private buildOptions?;
    constructor(transfers: PrivateTransfersInterface, userAddress: StarknetAddress, options?: ExecuteOptions, shadowAccountDeps?: {
        anonymizerAddress?: StarknetAddress;
        getViewingKey: () => Promise<ViewingKey>;
    } | undefined);
    register(): this;
    setup(recipient: StarknetAddress): this;
    invoke(callBuilder: (args: InvokeCalldataBuilderArgs) => CallDetails): this;
    computeAndInvoke(callBuilder: (args: InvokeCalldataBuilderArgs) => ComputeAndInvokeDetails): this;
    private assertNoInvokePhaseAction;
    shadowAccounts(dappName: string | BigNumberish): ShadowAccountsBuilder;
    surplusTo(recipient: StarknetAddress, withdraw?: boolean): this;
    with(token: StarknetAddress): TokenOperationsBuilder;
    with(token: StarknetAddress, ops: (t: TokenOperationsBuilder) => void): this;
    private collectActionsAndOptions;
    execute(options?: ExecuteOptions): Promise<ExecuteResult>;
    createProofInvocation(options?: ExecuteOptions): Promise<ProofInvocationResult>;
    simulate(options: SimulateOptions): Promise<ExecuteResult>;
}
//# sourceMappingURL=builders.d.ts.map