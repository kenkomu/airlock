/**
 * Call-based proving provider for testing
 *
 * This provider stands in for the real proving service by executing the invocation against a node
 * and capturing what the pool would have emitted, instead of generating a zero-knowledge proof.
 */
import type { BlockIdentifier, constants, ProviderInterface } from "starknet";
import type { Proof, ProofInvocation, ProofProviderInterface } from "../interfaces.js";
/**
 * A proving provider that uses Starknet calls to simulate proof generation.
 * This is useful for testing where we want to execute the contract logic
 * without actually generating zero-knowledge proofs.
 */
export declare class CallMockProofProvider implements ProofProviderInterface {
    protected readonly node: ProviderInterface;
    protected readonly chainId: constants.StarknetChainId;
    private readonly options?;
    constructor(node: ProviderInterface, chainId: constants.StarknetChainId, options?: {
        validateSignature?: boolean;
    } | undefined);
    getDefaultDetails(): Promise<import("../interfaces.js").ProofInvocationFactoryDetails>;
    prove(invocation: ProofInvocation, blockIdentifier?: BlockIdentifier): Promise<Proof>;
    /**
     * Runs the pool's compile step. A signed invocation is simulated as a real `__execute__` invoke, so
     * the pool itself runs `assert_valid_signature` — every accepted signature form (custom validation,
     * transaction hash, SNIP-12 `CallSet`) is honored exactly as on-chain, and an unauthorized one
     * panics with `INVALID_SIGNATURE`. Fee simulation and unsigned mock invocations instead use the
     * plain `compile_actions` view, which performs no signature check because a view has no `tx_info`.
     */
    private compileActions;
    /**
     * Simulates the invocation as an `__execute__` invoke and reads the compile output back out of the
     * L2-to-L1 message the pool emits (`send_message_to_server`), whose payload is
     * `[class_hash, ...server_actions]` — so the class hash needs no separate query.
     */
    private simulateExecute;
}
//# sourceMappingURL=mock-proving.d.ts.map