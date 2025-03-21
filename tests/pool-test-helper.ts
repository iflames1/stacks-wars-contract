// This file would be placed in helpers/test-utils.ts

/**
 * Helper utility for generating a proper signature for testing the claim-reward function
 */
import {
	createStacksPrivateKey,
	signWithKey,
	publicKeyToAddress,
} from "@stacks/wallet-sdk";
import { createHash } from "crypto";
import { StacksTestnet } from "@stacks/network";

/**
 * Creates a hashed message for claim-reward verification
 * @param poolId The pool ID
 * @param player The player's principal address
 * @param amount The reward amount
 * @returns The SHA256 hash of the message
 */
export function createMessageHash(
	poolId: number,
	player: string,
	amount: number
): Buffer {
	// Create a properly formatted message
	// Note: This must match exactly what the contract expects
	const message = `${poolId}:${player}:${amount}`;
	return createHash("sha256").update(message).digest();
}

/**
 * Signs a message with the trusted signer's private key
 * @param messageHash The hash of the message to sign
 * @param privateKey The private key to sign with (hex format with or without 0x prefix)
 * @returns The signature in the format expected by the contract
 */
export async function signMessage(
	messageHash: Buffer,
	privateKey: string
): Promise<Buffer> {
	// Remove 0x prefix if present
	if (privateKey.startsWith("0x")) {
		privateKey = privateKey.slice(2);
	}

	// Create a Stacks private key object
	const stacksPrivateKey = createStacksPrivateKey(privateKey);

	// Sign the message
	const signature = await signWithKey(
		stacksPrivateKey,
		messageHash.toString("hex")
	);

	// Return the signature as a buffer
	return Buffer.from(signature, "hex");
}

/**
 * Creates a complete test vector for claim-reward testing
 * @param poolId The pool ID
 * @param player The player's address
 * @param amount The reward amount
 * @param trustedSignerPrivateKey The private key of the trusted signer
 * @returns Object with messageHash and signature
 */
export async function createClaimRewardTestVector(
	poolId: number,
	player: string,
	amount: number,
	trustedSignerPrivateKey: string
) {
	const messageHash = createMessageHash(poolId, player, amount);
	const signature = await signMessage(messageHash, trustedSignerPrivateKey);

	return {
		messageHash,
		signature,
	};
}

/**
 * Create a test deployment file for use with Clarinet
 * This demonstrates how you might modify the contract for testing
 */
export function createTestDeployment() {
	// Example of how you might create a modified contract for testing
	const testContract = `
	;; Modified pool contract for testing
	;; Changes:
	;; - Uses a simplified msg-hash calculation for claim-reward
	;; - Allows overriding the TRUSTED_SIGNER for tests

	(define-data-var test-trusted-signer principal 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7)

	(define-public (set-test-trusted-signer (signer principal))
		(begin
		(var-set test-trusted-signer signer)
		(ok true)
		)
	)

	;; Modified claim-reward function for testing
	(define-public (test-claim-reward (pool-id uint) (amount uint) (signature (buff 65)))
		(begin
		;; Check if pool exists
		(asserts! (pool-exists pool-id) (err ERR_POOL_NOT_FOUND))

		;; Check if reward has already been claimed
		(asserts! (not (reward-claimed pool-id tx-sender)) (err ERR_REWARD_ALREADY_CLAIMED))

		;; Just verify that the signature came from the test trusted signer
		;; This is simplified for testing
		(let (
			(msg-hash (sha256 0x0000))
			(recovered-public-key (unwrap! (secp256k1-recover? msg-hash signature) (err ERR_INVALID_SIGNATURE)))
		)
			(asserts! (is-eq (unwrap! (principal-of? recovered-public-key) (err ERR_INVALID_SIGNATURE)) (var-get test-trusted-signer))
				(err ERR_INVALID_SIGNATURE))

			;; Rest of function remains the same...
		)
		)
	)
	`;

	return testContract;
}
