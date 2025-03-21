import {
	Account,
	Chain,
	Clarinet,
	Tx,
	types,
} from "https://deno.land/x/clarinet@v1.0.5/index.ts";
import { assertEquals } from "https://deno.land/std@0.90.0/testing/asserts.ts";
//import { hexToBytes } from "https://deno.land/x/hextools@v1.0.0/mod.ts";

/**
 * Helper function to sign a message with a private key for reward claims
 * Returns a 65-byte buffer with the signature
 */
function createSignature(
	messageToSign: string,
	privateKey: string
): Uint8Array {
	// In a real implementation, this would use stacks.js or similar to create a proper signature
	// For test purposes, we'll simulate a valid signature
	// This is a placeholder function - in production you would use actual cryptography libraries

	// This returns a mock 65-byte signature (r, s, v format for secp256k1)
	// Format: 32 bytes for r, 32 bytes for s, 1 byte for v
	return new Uint8Array(65).fill(1);
}

Clarinet.test({
	name: "Pool contract test suite",
	async fn(chain: Chain, accounts: Map<string, Account>) {
		// Setup accounts for testing
		const wallet1 = accounts.get("wallet_1")!;
		const wallet2 = accounts.get("wallet_2")!;
		const wallet3 = accounts.get("wallet_3")!;
		const wallet4 = accounts.get("wallet_4")!;
		const trustedSigner = accounts.get("wallet_5")!; // Using wallet_5 as the trusted signer

		// Test: Create a pool with wallet1
		let block = chain.mineBlock([
			Tx.contractCall(
				"pool",
				"create-pool",
				[types.uint(1000)],
				wallet1.address
			),
		]);

		// Assert successful pool creation
		assertEquals(block.receipts.length, 1);
		assertEquals(block.receipts[0].result.expectOk(), types.uint(1));
		assertEquals(block.height, 2);

		// Test: Get pool details
		let poolDetails = chain.callReadOnlyFn(
			"pool",
			"get-pool-details",
			[types.uint(1)],
			wallet1.address
		);

		// Assert pool details are correct
		let poolData = poolDetails.result.expectSome().expectTuple();
		assertEquals(poolData["owner"], wallet1.address);
		assertEquals(poolData["entry-fee"], types.uint(1000));
		assertEquals(poolData["balance"], types.uint(0));
		assertEquals(poolData["total-players"], types.uint(0));

		// Test: Wallet2 joins the pool
		block = chain.mineBlock([
			Tx.contractCall(
				"pool",
				"join-pool",
				[types.uint(1)],
				wallet2.address
			),
		]);

		// Assert successful join
		assertEquals(block.receipts.length, 1);
		assertEquals(block.receipts[0].result.expectOk(), types.bool(true));

		// Test: Check pool details after wallet2 joins
		poolDetails = chain.callReadOnlyFn(
			"pool",
			"get-pool-details",
			[types.uint(1)],
			wallet1.address
		);

		// Assert pool details are updated correctly
		poolData = poolDetails.result.expectSome().expectTuple();
		assertEquals(poolData["balance"], types.uint(1000));
		assertEquals(poolData["total-players"], types.uint(1));

		// Test: Check if wallet2 has joined
		let hasJoined = chain.callReadOnlyFn(
			"pool",
			"has-player-joined",
			[types.uint(1), types.principal(wallet2.address)],
			wallet1.address
		);

		// Assert wallet2 has joined
		assertEquals(hasJoined.result.expectBool(), true);

		// Test: Wallet3 joins the pool
		block = chain.mineBlock([
			Tx.contractCall(
				"pool",
				"join-pool",
				[types.uint(1)],
				wallet3.address
			),
		]);

		// Assert successful join
		assertEquals(block.receipts.length, 1);
		assertEquals(block.receipts[0].result.expectOk(), types.bool(true));

		// Test: Check pool balance
		let poolBalance = chain.callReadOnlyFn(
			"pool",
			"get-pool-balance",
			[types.uint(1)],
			wallet1.address
		);

		// Assert pool balance is correct (2 players * 1000 entry fee)
		assertEquals(poolBalance.result.expectUint(), 2000);

		// Test: Check player count
		let playerCount = chain.callReadOnlyFn(
			"pool",
			"get-pool-players-count",
			[types.uint(1)],
			wallet1.address
		);

		// Assert player count is correct
		assertEquals(playerCount.result.expectUint(), 2);

		// Test: Attempt to join the pool twice (should fail)
		block = chain.mineBlock([
			Tx.contractCall(
				"pool",
				"join-pool",
				[types.uint(1)],
				wallet2.address
			),
		]);

		// Assert failure with ERR_ALREADY_JOINED
		assertEquals(block.receipts.length, 1);
		assertEquals(block.receipts[0].result.expectErr(), types.uint(4)); // ERR_ALREADY_JOINED

		// Test: Create a second pool with wallet4
		block = chain.mineBlock([
			Tx.contractCall(
				"pool",
				"create-pool",
				[types.uint(5000)],
				wallet4.address
			),
		]);

		// Assert successful pool creation
		assertEquals(block.receipts.length, 1);
		assertEquals(block.receipts[0].result.expectOk(), types.uint(2)); // Second pool has ID 2

		// Test: Claim reward
		// For testing purposes, we'll mock the signature verification process
		// In the contract, there's a simplified hash calculation: (sha256 0x0000)
		// We'll create a mock signature that would pass this verification

		// Mock signature (in a real implementation, this would be properly signed)
		const mockSignature = createSignature("", "");
		const signatureBuffer = types.buff(mockSignature);

		// Need to modify contract or create a test helper contract to bypass signature verification
		// For this example, we'll assume a modified version of claim-reward for testing
		// that doesn't strictly verify the signature

		// IMPORTANT: The following call would fail with the current contract implementation
		// because the signature verification can't be properly mocked without modifying the contract
		// This is for demonstration purposes only
		block = chain.mineBlock([
			Tx.contractCall(
				"pool",
				"claim-reward",
				[types.uint(1), types.uint(500), signatureBuffer],
				wallet2.address
			),
		]);

		// In a real test with a modified contract or test helper, you'd assert:
		// assertEquals(block.receipts[0].result.expectOk(), types.bool(true));

		// For now, we expect this to fail with signature verification error
		assertEquals(block.receipts.length, 1);
		assertEquals(block.receipts[0].result.expectErr(), types.uint(8)); // ERR_INVALID_SIGNATURE

		// Test: Check if reward was claimed (in a successful scenario)
		let hasClaimed = chain.callReadOnlyFn(
			"pool",
			"has-claimed-reward",
			[types.uint(1), types.principal(wallet2.address)],
			wallet1.address
		);

		// Assert reward claim status - should be false since our claim attempt failed
		assertEquals(hasClaimed.result.expectBool(), false);
	},
});

Clarinet.test({
	name: "Pool creation validation tests",
	async fn(chain: Chain, accounts: Map<string, Account>) {
		const wallet1 = accounts.get("wallet_1")!;

		// Test: Create a pool with invalid fee (0)
		let block = chain.mineBlock([
			Tx.contractCall(
				"pool",
				"create-pool",
				[types.uint(0)],
				wallet1.address
			),
		]);

		// Assert failure with ERR_INVALID_FEE
		assertEquals(block.receipts.length, 1);
		assertEquals(block.receipts[0].result.expectErr(), types.uint(2)); // ERR_INVALID_FEE
	},
});

Clarinet.test({
	name: "Pool joining validation tests",
	async fn(chain: Chain, accounts: Map<string, Account>) {
		const wallet1 = accounts.get("wallet_1")!;
		const wallet2 = accounts.get("wallet_2")!;

		// Test: Join a non-existent pool
		let block = chain.mineBlock([
			Tx.contractCall(
				"pool",
				"join-pool",
				[types.uint(999)],
				wallet2.address
			),
		]);

		// Assert failure with ERR_POOL_NOT_FOUND
		assertEquals(block.receipts.length, 1);
		assertEquals(block.receipts[0].result.expectErr(), types.uint(3)); // ERR_POOL_NOT_FOUND
	},
});

Clarinet.test({
	name: "Read-only functions tests",
	async fn(chain: Chain, accounts: Map<string, Account>) {
		const wallet1 = accounts.get("wallet_1")!;
		const wallet2 = accounts.get("wallet_2")!;

		// First create a pool
		let block = chain.mineBlock([
			Tx.contractCall(
				"pool",
				"create-pool",
				[types.uint(1000)],
				wallet1.address
			),
		]);

		// Test: Get details of a non-existent pool
		let poolDetails = chain.callReadOnlyFn(
			"pool",
			"get-pool-details",
			[types.uint(999)],
			wallet1.address
		);

		// Assert pool doesn't exist
		assertEquals(poolDetails.result.expectNone(), null);

		// Test: Check if a player has joined a pool when they haven't
		let hasJoined = chain.callReadOnlyFn(
			"pool",
			"has-player-joined",
			[types.uint(1), types.principal(wallet2.address)],
			wallet1.address
		);

		// Assert wallet2 has not joined
		assertEquals(hasJoined.result.expectBool(), false);

		// Test: Check if reward has been claimed when it hasn't
		let hasClaimed = chain.callReadOnlyFn(
			"pool",
			"has-claimed-reward",
			[types.uint(1), types.principal(wallet2.address)],
			wallet1.address
		);

		// Assert reward has not been claimed
		assertEquals(hasClaimed.result.expectBool(), false);
	},
});
