import { BigNumberish, Call } from "starknet";
import type { CollectPolicy, PrivateTransfersBuilder, StarknetAddress, ShadowAccountsBuilder, ViewingKey } from "../interfaces.js";
export declare class ShadowAccountsBuilderImpl implements ShadowAccountsBuilder {
    private readonly params;
    private readonly dappName;
    private readonly shadowAccountAnonymizerAddress;
    constructor(params: {
        builder: PrivateTransfersBuilder;
        dappName: string | BigNumberish;
        shadowAccountAnonymizerAddress: StarknetAddress;
        user: bigint;
        getViewingKey: () => Promise<ViewingKey>;
    });
    invoke(nonce: BigNumberish, options: {
        calls: Call[];
        collectPolicy?: CollectPolicy;
    }): PrivateTransfersBuilder;
    partialCommitment(): Promise<bigint>;
    commitment(nonce: BigNumberish): Promise<bigint>;
}
//# sourceMappingURL=shadow-accounts.d.ts.map