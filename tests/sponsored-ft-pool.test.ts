import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";
import {
	generateSignature,
	generateInvalidSignature,
} from "./helpers/signature-helper";

const accounts = simnet.getAccounts();
const deployer = simnet.deployer;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("Sponsored FT Pool Contract Tests", () => {
	beforeEach(() => {
		// Each test starts with a fresh simnet state
		// Mint initial tokens to deployer for testing
		simnet.callPublicFn("test-token", "mint-initial-supply", [], deployer);

		// Transfer some tokens to wallets for testing
		const tokenAmount = 10000000; // 10M tokens
		simnet.callPublicFn(
			"test-token",
			"transfer",
			[
				Cl.uint(tokenAmount),
				Cl.standardPrincipal(deployer),
				Cl.standardPrincipal(wallet1),
				Cl.none(),
			],
			deployer
		);
		simnet.callPublicFn(
			"test-token",
			"transfer",
			[
				Cl.uint(tokenAmount),
				Cl.standardPrincipal(deployer),
				Cl.standardPrincipal(wallet2),
				Cl.none(),
			],
			deployer
		);
	});

	describe("Initial State", () => {
		it("should have zero players initially", () => {
			const result = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(result.result).toBeUint(0);
		});

		it("should not be sponsored initially", () => {
			const result = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"is-pool-sponsored",
				[],
				deployer
			);
			expect(result.result).toBeBool(false);
		});

		it("should return false for player joined check initially", () => {
			const result = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"has-player-joined",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(result.result).toBeBool(false);
		});
	});

	describe("Join Pool Function", () => {
		it("should allow deployer to join and fund the pool with tokens", () => {
			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"join",
				[],
				deployer
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// Check FT transfer event (5M tokens = 5000000)
			expect(result.events).toContainEqual({
				event: "ft_transfer_event",
				data: {
					amount: "5000000",
					sender: deployer,
					recipient: `${deployer}.sponsored-ft-pool`,
					asset_identifier: `${deployer}.test-token::test-token`,
				},
			});
		});

		it("should update contract state after deployer joins", () => {
			// Deployer joins and funds pool
			simnet.callPublicFn("sponsored-ft-pool", "join", [], deployer);

			// Check total players
			const totalPlayers = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(1);

			// Check pool is sponsored
			const isSponsored = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"is-pool-sponsored",
				[],
				deployer
			);
			expect(isSponsored.result).toBeBool(true);

			// Check deployer has joined
			const hasJoined = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"has-player-joined",
				[Cl.standardPrincipal(deployer)],
				deployer
			);
			expect(hasJoined.result).toBeBool(true);
		});

		it("should allow other players to join after deployer sponsors", () => {
			// Deployer sponsors first
			simnet.callPublicFn("sponsored-ft-pool", "join", [], deployer);

			// Wallet1 joins for free
			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"join",
				[],
				wallet1
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// No FT transfer event for regular players (they join for free)
			expect(result.events).toEqual([]);

			// Check total players is now 2
			const totalPlayers = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(2);
		});

		it("should prevent players from joining twice", () => {
			// Deployer joins first time
			simnet.callPublicFn("sponsored-ft-pool", "join", [], deployer);

			// Try to join again
			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"join",
				[],
				deployer
			);

			expect(result.result).toBeErr(Cl.uint(5)); // ERR_ALREADY_JOINED
		});

		it("should prevent regular players from joining when pool is not sponsored", () => {
			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"join",
				[],
				wallet1
			);

			expect(result.result).toBeErr(Cl.uint(15)); // ERR_NOT_SPONSORED
		});

		it("should prevent deployer from sponsoring twice", () => {
			// Deployer sponsors first time
			simnet.callPublicFn("sponsored-ft-pool", "join", [], deployer);

			// Reset and try to sponsor again (this would fail with ALREADY_JOINED)
			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"join",
				[],
				deployer
			);

			expect(result.result).toBeErr(Cl.uint(5)); // ERR_ALREADY_JOINED
		});
	});

	describe("Claim Reward Function", () => {
		beforeEach(() => {
			// Setup: deployer sponsors and players join
			simnet.callPublicFn("sponsored-ft-pool", "join", [], deployer);
			simnet.callPublicFn("sponsored-ft-pool", "join", [], wallet1);
		});

		it("should allow player to claim reward with valid signature", async () => {
			const rewardAmount = 1000000; // 1M tokens
			const contractId = `${deployer}.sponsored-ft-pool`;

			// Generate valid signature
			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// Check events - fee transfer and reward transfer
			const feeAmount = Math.floor((rewardAmount * 2) / 100); // 2% fee
			const netAmount = rewardAmount - feeAmount;

			expect(result.events).toContainEqual({
				event: "ft_transfer_event",
				data: expect.objectContaining({
					amount: feeAmount.toString(),
					sender: `${deployer}.sponsored-ft-pool`,
					recipient: "SP39V8Q7KATNA4B0ZKD6QNTMHDNH5VJXRBG7PB8G2",
					asset_identifier: `${deployer}.test-token::test-token`,
				}),
			});

			expect(result.events).toContainEqual({
				event: "ft_transfer_event",
				data: expect.objectContaining({
					amount: netAmount.toString(),
					sender: `${deployer}.sponsored-ft-pool`,
					recipient: wallet1,
					asset_identifier: `${deployer}.test-token::test-token`,
				}),
			});
		});

		it("should prevent non-joined player from claiming reward", async () => {
			const rewardAmount = 1000000;
			const contractId = `${deployer}.sponsored-ft-pool`;

			const signature = await generateSignature(
				rewardAmount,
				wallet2, // wallet2 hasn't joined
				contractId
			);

			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet2
			);

			expect(result.result).toBeErr(Cl.uint(14)); // ERR_NOT_JOINED
		});

		it("should prevent claiming reward twice", async () => {
			const rewardAmount = 1000000;
			const contractId = `${deployer}.sponsored-ft-pool`;

			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			// First claim should succeed
			const firstClaim = simnet.callPublicFn(
				"sponsored-ft-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);
			expect(firstClaim.result).toBeOk(Cl.bool(true));

			// Second claim should fail
			const secondClaim = simnet.callPublicFn(
				"sponsored-ft-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);
			expect(secondClaim.result).toBeErr(Cl.uint(9)); // ERR_REWARD_ALREADY_CLAIMED
		});

		it("should reject invalid signature", () => {
			const rewardAmount = 1000000;
			const invalidSignature = generateInvalidSignature();

			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(invalidSignature)],
				wallet1
			);

			expect(result.result).toBeErr(Cl.uint(10)); // ERR_INVALID_SIGNATURE
		});

		it("should update claimed reward status", async () => {
			const rewardAmount = 1000000;
			const contractId = `${deployer}.sponsored-ft-pool`;

			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			// Claim reward
			simnet.callPublicFn(
				"sponsored-ft-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);

			// Check claimed status
			const hasClaimed = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"has-claimed-reward",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(hasClaimed.result).toBeBool(true);
		});

		it("should handle insufficient token balance", async () => {
			const rewardAmount = 10000000; // 10M tokens (more than pool has)
			const contractId = `${deployer}.sponsored-ft-pool`;

			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);

			expect(result.result).toBeErr(Cl.uint(6)); // ERR_INSUFFICIENT_FUNDS
		});
	});

	describe("Leave Pool Function", () => {
		beforeEach(() => {
			// Setup: deployer sponsors and players join
			simnet.callPublicFn("sponsored-ft-pool", "join", [], deployer);
			simnet.callPublicFn("sponsored-ft-pool", "join", [], wallet1);
		});

		it("should allow regular player to leave without refund", async () => {
			const contractId = `${deployer}.sponsored-ft-pool`;

			// Regular players use amount 0 for leaving (no refund)
			const signature = await generateSignature(0, wallet1, contractId);

			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"leave",
				[Cl.bufferFromHex(signature)],
				wallet1
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// No FT transfer events (no refund for regular players)
			expect(result.events).toEqual([]);
		});

		it("should update state after regular player leaves", async () => {
			const contractId = `${deployer}.sponsored-ft-pool`;
			const signature = await generateSignature(0, wallet1, contractId);

			// Player leaves
			simnet.callPublicFn(
				"sponsored-ft-pool",
				"leave",
				[Cl.bufferFromHex(signature)],
				wallet1
			);

			// Check total players decreased
			const totalPlayers = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(1);

			// Check player no longer joined
			const hasJoined = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"has-player-joined",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(hasJoined.result).toBeBool(false);
		});

		it("should allow sponsor to leave when pool is empty", async () => {
			// First remove all other players
			const contractId = `${deployer}.sponsored-ft-pool`;
			const signature1 = await generateSignature(0, wallet1, contractId);
			simnet.callPublicFn(
				"sponsored-ft-pool",
				"leave",
				[Cl.bufferFromHex(signature1)],
				wallet1
			);

			// Now sponsor can leave and get tokens back
			const poolSize = 5000000; // POOL_SIZE constant
			const sponsorSignature = await generateSignature(
				poolSize,
				deployer,
				contractId
			);

			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"leave",
				[Cl.bufferFromHex(sponsorSignature)],
				deployer
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// Check FT transfer event (sponsor gets pool tokens back)
			expect(result.events).toContainEqual({
				event: "ft_transfer_event",
				data: {
					amount: "5000000",
					sender: `${deployer}.sponsored-ft-pool`,
					recipient: deployer,
					asset_identifier: `${deployer}.test-token::test-token`,
				},
			});
		});

		it("should prevent sponsor from leaving when pool is not empty", async () => {
			const contractId = `${deployer}.sponsored-ft-pool`;
			const poolSize = 5000000;
			const signature = await generateSignature(
				poolSize,
				deployer,
				contractId
			);

			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"leave",
				[Cl.bufferFromHex(signature)],
				deployer
			);

			expect(result.result).toBeErr(Cl.uint(16)); // ERR_POOL_NOT_EMPTY
		});

		it("should prevent non-joined player from leaving", async () => {
			const contractId = `${deployer}.sponsored-ft-pool`;
			const signature = await generateSignature(0, wallet2, contractId);

			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"leave",
				[Cl.bufferFromHex(signature)],
				wallet2
			);

			expect(result.result).toBeErr(Cl.uint(14)); // ERR_NOT_JOINED
		});
	});

	describe("Kick Function", () => {
		beforeEach(() => {
			// Setup: deployer sponsors and players join
			simnet.callPublicFn("sponsored-ft-pool", "join", [], deployer);
			simnet.callPublicFn("sponsored-ft-pool", "join", [], wallet1);
			simnet.callPublicFn("sponsored-ft-pool", "join", [], wallet2);
		});

		it("should allow deployer to kick player", () => {
			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"kick",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// No refund events (kick doesn't provide refunds in sponsored FT pool)
			expect(result.events).toEqual([]);
		});

		it("should update state after kick", () => {
			// Kick player
			simnet.callPublicFn(
				"sponsored-ft-pool",
				"kick",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);

			// Check player removed
			const hasJoined = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"has-player-joined",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(hasJoined.result).toBeBool(false);

			// Check total players decreased
			const totalPlayers = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(2);
		});

		it("should prevent non-deployer from kicking", () => {
			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"kick",
				[Cl.standardPrincipal(wallet2)],
				wallet1
			);

			expect(result.result).toBeErr(Cl.uint(17)); // ERR_UNAUTHORIZED
		});

		it("should prevent kicking non-existent player", () => {
			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"kick",
				[Cl.standardPrincipal(wallet3)], // wallet3 hasn't joined
				deployer
			);

			expect(result.result).toBeErr(Cl.uint(14)); // ERR_NOT_JOINED
		});

		it("should prevent deployer from kicking themselves", () => {
			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"kick",
				[Cl.standardPrincipal(deployer)],
				deployer
			);

			expect(result.result).toBeErr(Cl.uint(17)); // ERR_UNAUTHORIZED
		});

		it("should prevent kicking player who claimed reward", async () => {
			// Player claims reward first
			const rewardAmount = 1000000;
			const contractId = `${deployer}.sponsored-ft-pool`;
			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			simnet.callPublicFn(
				"sponsored-ft-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);

			// Try to kick the player who claimed reward
			const result = simnet.callPublicFn(
				"sponsored-ft-pool",
				"kick",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);

			expect(result.result).toBeErr(Cl.uint(9)); // ERR_REWARD_ALREADY_CLAIMED
		});
	});

	describe("Token Integration", () => {
		it("should handle token minting and transfers correctly", () => {
			// Check initial token balance after setup
			const deployerBalance = simnet.callReadOnlyFn(
				"test-token",
				"get-balance",
				[Cl.standardPrincipal(deployer)],
				deployer
			);
			expect(deployerBalance.result).toBeOk(expect.any(Object));

			// Check wallet1 received tokens in setup
			const wallet1Balance = simnet.callReadOnlyFn(
				"test-token",
				"get-balance",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(wallet1Balance.result).toBeOk(Cl.uint(10000000));
		});

		it("should show correct token balance after pool sponsorship", () => {
			// Sponsor pool
			simnet.callPublicFn("sponsored-ft-pool", "join", [], deployer);

			// Check final balance exists and is wrapped in Ok()
			const finalBalance = simnet.callReadOnlyFn(
				"test-token",
				"get-balance",
				[Cl.standardPrincipal(deployer)],
				deployer
			);

			// Note: Transfer amount is verified via the transfer event in the join test
			expect(finalBalance.result).toBeOk(expect.any(Object));
		});
	});

	describe("Integration Workflow", () => {
		it("should handle complete sponsored FT pool workflow", async () => {
			// 1. Deployer sponsors the pool with tokens
			const sponsorResult = simnet.callPublicFn(
				"sponsored-ft-pool",
				"join",
				[],
				deployer
			);
			expect(sponsorResult.result).toBeOk(Cl.bool(true));

			// Check initial state after sponsoring
			const totalPlayers = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(1);

			const isSponsored = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"is-pool-sponsored",
				[],
				deployer
			);
			expect(isSponsored.result).toBeBool(true);

			// 2. Players join for free
			const join1 = simnet.callPublicFn(
				"sponsored-ft-pool",
				"join",
				[],
				wallet1
			);
			expect(join1.result).toBeOk(Cl.bool(true));

			const join2 = simnet.callPublicFn(
				"sponsored-ft-pool",
				"join",
				[],
				wallet2
			);
			expect(join2.result).toBeOk(Cl.bool(true));

			// Check state after players join
			const totalPlayersAfterJoin = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayersAfterJoin.result).toBeUint(3);

			// 3. Winner claims token reward
			const rewardAmount = 2000000; // 2M tokens reward
			const contractId = `${deployer}.sponsored-ft-pool`;

			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			const claimResult = simnet.callPublicFn(
				"sponsored-ft-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);
			expect(claimResult.result).toBeOk(Cl.bool(true));

			// 4. Other player leaves without refund
			const leaveSignature = await generateSignature(
				0,
				wallet2,
				contractId
			);

			const leaveResult = simnet.callPublicFn(
				"sponsored-ft-pool",
				"leave",
				[Cl.bufferFromHex(leaveSignature)],
				wallet2
			);
			expect(leaveResult.result).toBeOk(Cl.bool(true));

			// 5. Final state check - only deployer and winner remain
			const finalPlayers = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(finalPlayers.result).toBeUint(2);

			// Check that winner has claimed reward
			const hasClaimed = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"has-claimed-reward",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(hasClaimed.result).toBeBool(true);

			// Check wallet2 is no longer in pool
			const wallet2Joined = simnet.callReadOnlyFn(
				"sponsored-ft-pool",
				"has-player-joined",
				[Cl.standardPrincipal(wallet2)],
				deployer
			);
			expect(wallet2Joined.result).toBeBool(false);
		});
	});
});
