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

describe("Sponsored Pool Contract Tests", () => {
	beforeEach(() => {
		// Each test starts with a fresh simnet state
	});

	describe("Initial State", () => {
		it("should have zero players initially", () => {
			const result = simnet.callReadOnlyFn(
				"sponsored-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(result.result).toBeUint(0);
		});

		it("should have zero pool balance initially", () => {
			const result = simnet.callReadOnlyFn(
				"sponsored-pool",
				"get-pool-balance",
				[],
				deployer
			);
			expect(result.result).toBeUint(0);
		});

		it("should not be sponsored initially", () => {
			const result = simnet.callReadOnlyFn(
				"sponsored-pool",
				"is-pool-sponsored",
				[],
				deployer
			);
			expect(result.result).toBeBool(false);
		});

		it("should return false for player joined check initially", () => {
			const result = simnet.callReadOnlyFn(
				"sponsored-pool",
				"has-player-joined",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(result.result).toBeBool(false);
		});
	});

	describe("Join Pool Function", () => {
		it("should allow deployer to join and fund the pool", () => {
			const result = simnet.callPublicFn(
				"sponsored-pool",
				"join",
				[],
				deployer
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// Check STX transfer event (50 STX = 50000000 microSTX)
			expect(result.events).toContainEqual({
				event: "stx_transfer_event",
				data: {
					amount: "50000000",
					sender: deployer,
					recipient: `${deployer}.sponsored-pool`,
					memo: "",
				},
			});
		});

		it("should update contract state after deployer joins", () => {
			// Deployer joins and funds pool
			simnet.callPublicFn("sponsored-pool", "join", [], deployer);

			// Check total players
			const totalPlayers = simnet.callReadOnlyFn(
				"sponsored-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(1);

			// Check pool balance (50 STX)
			const poolBalance = simnet.callReadOnlyFn(
				"sponsored-pool",
				"get-pool-balance",
				[],
				deployer
			);
			expect(poolBalance.result).toBeUint(50000000);

			// Check pool is sponsored
			const isSponsored = simnet.callReadOnlyFn(
				"sponsored-pool",
				"is-pool-sponsored",
				[],
				deployer
			);
			expect(isSponsored.result).toBeBool(true);

			// Check deployer has joined
			const hasJoined = simnet.callReadOnlyFn(
				"sponsored-pool",
				"has-player-joined",
				[Cl.standardPrincipal(deployer)],
				deployer
			);
			expect(hasJoined.result).toBeBool(true);
		});

		it("should allow other players to join after deployer sponsors", () => {
			// Deployer sponsors first
			simnet.callPublicFn("sponsored-pool", "join", [], deployer);

			// Wallet1 joins for free
			const result = simnet.callPublicFn(
				"sponsored-pool",
				"join",
				[],
				wallet1
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// No STX transfer event for regular players (they join for free)
			expect(result.events).toEqual([]);

			// Check total players is now 2
			const totalPlayers = simnet.callReadOnlyFn(
				"sponsored-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(2);

			// Pool balance should remain 50 STX
			const poolBalance = simnet.callReadOnlyFn(
				"sponsored-pool",
				"get-pool-balance",
				[],
				deployer
			);
			expect(poolBalance.result).toBeUint(50000000);
		});

		it("should prevent players from joining twice", () => {
			// Deployer joins first time
			simnet.callPublicFn("sponsored-pool", "join", [], deployer);

			// Try to join again
			const result = simnet.callPublicFn(
				"sponsored-pool",
				"join",
				[],
				deployer
			);

			expect(result.result).toBeErr(Cl.uint(5)); // ERR_ALREADY_JOINED
		});

		it("should prevent regular players from joining when pool is not sponsored", () => {
			const result = simnet.callPublicFn(
				"sponsored-pool",
				"join",
				[],
				wallet1
			);

			expect(result.result).toBeErr(Cl.uint(15)); // ERR_NOT_SPONSORED
		});

		it("should prevent deployer from sponsoring twice", () => {
			// Deployer sponsors first time
			simnet.callPublicFn("sponsored-pool", "join", [], deployer);

			// Reset and try to sponsor again (this would fail with ALREADY_JOINED)
			const result = simnet.callPublicFn(
				"sponsored-pool",
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
			simnet.callPublicFn("sponsored-pool", "join", [], deployer);
			simnet.callPublicFn("sponsored-pool", "join", [], wallet1);
		});

		it("should allow player to claim reward with valid signature", async () => {
			const rewardAmount = 10000000; // 10 STX
			const contractId = `${deployer}.sponsored-pool`;

			// Generate valid signature
			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			const result = simnet.callPublicFn(
				"sponsored-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// Check events - fee transfer and reward transfer
			expect(result.events).toContainEqual({
				event: "stx_transfer_event",
				data: expect.objectContaining({
					amount: "200000", // 2% fee
					sender: `${deployer}.sponsored-pool`,
					recipient: "SP39V8Q7KATNA4B0ZKD6QNTMHDNH5VJXRBG7PB8G2",
				}),
			});

			expect(result.events).toContainEqual({
				event: "stx_transfer_event",
				data: expect.objectContaining({
					amount: "9800000", // Net amount after fee
					sender: `${deployer}.sponsored-pool`,
					recipient: wallet1,
				}),
			});
		});

		it("should prevent non-joined player from claiming reward", async () => {
			const rewardAmount = 10000000;
			const contractId = `${deployer}.sponsored-pool`;

			const signature = await generateSignature(
				rewardAmount,
				wallet2, // wallet2 hasn't joined
				contractId
			);

			const result = simnet.callPublicFn(
				"sponsored-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet2
			);

			expect(result.result).toBeErr(Cl.uint(14)); // ERR_NOT_JOINED
		});

		it("should prevent claiming reward twice", async () => {
			const rewardAmount = 10000000;
			const contractId = `${deployer}.sponsored-pool`;

			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			// First claim should succeed
			const firstClaim = simnet.callPublicFn(
				"sponsored-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);
			expect(firstClaim.result).toBeOk(Cl.bool(true));

			// Second claim should fail
			const secondClaim = simnet.callPublicFn(
				"sponsored-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);
			expect(secondClaim.result).toBeErr(Cl.uint(9)); // ERR_REWARD_ALREADY_CLAIMED
		});

		it("should reject invalid signature", () => {
			const rewardAmount = 10000000;
			const invalidSignature = generateInvalidSignature();

			const result = simnet.callPublicFn(
				"sponsored-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(invalidSignature)],
				wallet1
			);

			expect(result.result).toBeErr(Cl.uint(10)); // ERR_INVALID_SIGNATURE
		});

		it("should update claimed reward status", async () => {
			const rewardAmount = 10000000;
			const contractId = `${deployer}.sponsored-pool`;

			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			// Claim reward
			simnet.callPublicFn(
				"sponsored-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);

			// Check claimed status
			const hasClaimed = simnet.callReadOnlyFn(
				"sponsored-pool",
				"has-claimed-reward",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(hasClaimed.result).toBeBool(true);
		});
	});

	describe("Leave Pool Function", () => {
		beforeEach(() => {
			// Setup: deployer sponsors and players join
			simnet.callPublicFn("sponsored-pool", "join", [], deployer);
			simnet.callPublicFn("sponsored-pool", "join", [], wallet1);
		});

		it("should allow regular player to leave without refund", async () => {
			const contractId = `${deployer}.sponsored-pool`;

			// Regular players use amount 0 for leaving (no refund)
			const signature = await generateSignature(0, wallet1, contractId);

			const result = simnet.callPublicFn(
				"sponsored-pool",
				"leave",
				[Cl.bufferFromHex(signature)],
				wallet1
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// No STX transfer events (no refund for regular players)
			expect(result.events).toEqual([]);
		});

		it("should update state after regular player leaves", async () => {
			const contractId = `${deployer}.sponsored-pool`;
			const signature = await generateSignature(0, wallet1, contractId);

			// Player leaves
			simnet.callPublicFn(
				"sponsored-pool",
				"leave",
				[Cl.bufferFromHex(signature)],
				wallet1
			);

			// Check total players decreased
			const totalPlayers = simnet.callReadOnlyFn(
				"sponsored-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(1);

			// Check player no longer joined
			const hasJoined = simnet.callReadOnlyFn(
				"sponsored-pool",
				"has-player-joined",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(hasJoined.result).toBeBool(false);

			// Pool balance should remain the same (no refund)
			const poolBalance = simnet.callReadOnlyFn(
				"sponsored-pool",
				"get-pool-balance",
				[],
				deployer
			);
			expect(poolBalance.result).toBeUint(50000000);
		});

		it("should allow sponsor to leave when pool is empty", async () => {
			// First remove all other players
			const contractId = `${deployer}.sponsored-pool`;
			const signature1 = await generateSignature(0, wallet1, contractId);
			simnet.callPublicFn(
				"sponsored-pool",
				"leave",
				[Cl.bufferFromHex(signature1)],
				wallet1
			);

			// Now sponsor can leave and get funds back
			const sponsorSignature = await generateSignature(
				50000000,
				deployer,
				contractId
			);

			const result = simnet.callPublicFn(
				"sponsored-pool",
				"leave",
				[Cl.bufferFromHex(sponsorSignature)],
				deployer
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// Check STX transfer event (sponsor gets pool funds back)
			expect(result.events).toContainEqual({
				event: "stx_transfer_event",
				data: {
					amount: "50000000",
					sender: `${deployer}.sponsored-pool`,
					recipient: deployer,
					memo: "",
				},
			});
		});

		it("should prevent sponsor from leaving when pool is not empty", async () => {
			const contractId = `${deployer}.sponsored-pool`;
			const signature = await generateSignature(
				50000000,
				deployer,
				contractId
			);

			const result = simnet.callPublicFn(
				"sponsored-pool",
				"leave",
				[Cl.bufferFromHex(signature)],
				deployer
			);

			expect(result.result).toBeErr(Cl.uint(16)); // ERR_POOL_NOT_EMPTY
		});

		it("should prevent non-joined player from leaving", async () => {
			const contractId = `${deployer}.sponsored-pool`;
			const signature = await generateSignature(0, wallet2, contractId);

			const result = simnet.callPublicFn(
				"sponsored-pool",
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
			simnet.callPublicFn("sponsored-pool", "join", [], deployer);
			simnet.callPublicFn("sponsored-pool", "join", [], wallet1);
			simnet.callPublicFn("sponsored-pool", "join", [], wallet2);
		});

		it("should allow deployer to kick player", () => {
			const result = simnet.callPublicFn(
				"sponsored-pool",
				"kick",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// No refund events (kick doesn't provide refunds in sponsored pool)
			expect(result.events).toEqual([]);
		});

		it("should update state after kick", () => {
			// Kick player
			simnet.callPublicFn(
				"sponsored-pool",
				"kick",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);

			// Check player removed
			const hasJoined = simnet.callReadOnlyFn(
				"sponsored-pool",
				"has-player-joined",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(hasJoined.result).toBeBool(false);

			// Check total players decreased
			const totalPlayers = simnet.callReadOnlyFn(
				"sponsored-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(2);
		});

		it("should prevent non-deployer from kicking", () => {
			const result = simnet.callPublicFn(
				"sponsored-pool",
				"kick",
				[Cl.standardPrincipal(wallet2)],
				wallet1
			);

			expect(result.result).toBeErr(Cl.uint(17)); // ERR_UNAUTHORIZED
		});

		it("should prevent kicking non-existent player", () => {
			const result = simnet.callPublicFn(
				"sponsored-pool",
				"kick",
				[Cl.standardPrincipal(wallet3)], // wallet3 hasn't joined
				deployer
			);

			expect(result.result).toBeErr(Cl.uint(14)); // ERR_NOT_JOINED
		});

		it("should prevent deployer from kicking themselves", () => {
			const result = simnet.callPublicFn(
				"sponsored-pool",
				"kick",
				[Cl.standardPrincipal(deployer)],
				deployer
			);

			expect(result.result).toBeErr(Cl.uint(17)); // ERR_UNAUTHORIZED
		});

		it("should prevent kicking player who claimed reward", async () => {
			// Player claims reward first
			const rewardAmount = 10000000;
			const contractId = `${deployer}.sponsored-pool`;
			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			simnet.callPublicFn(
				"sponsored-pool",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);

			// Try to kick the player who claimed reward
			const result = simnet.callPublicFn(
				"sponsored-pool",
				"kick",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);

			expect(result.result).toBeErr(Cl.uint(9)); // ERR_REWARD_ALREADY_CLAIMED
		});
	});

	describe("Integration Workflow", () => {
		it("should handle complete sponsored pool workflow", async () => {
			// 1. Deployer sponsors the pool
			const sponsorResult = simnet.callPublicFn(
				"sponsored-pool",
				"join",
				[],
				deployer
			);
			expect(sponsorResult.result).toBeOk(Cl.bool(true));

			// Check initial state after sponsoring
			const totalPlayers = simnet.callReadOnlyFn(
				"sponsored-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(1);

			const poolBalance = simnet.callReadOnlyFn(
				"sponsored-pool",
				"get-pool-balance",
				[],
				deployer
			);
			expect(poolBalance.result).toBeUint(50000000);

			const isSponsored = simnet.callReadOnlyFn(
				"sponsored-pool",
				"is-pool-sponsored",
				[],
				deployer
			);
			expect(isSponsored.result).toBeBool(true);

			// 2. Players join for free
			const join1 = simnet.callPublicFn(
				"sponsored-pool",
				"join",
				[],
				wallet1
			);
			expect(join1.result).toBeOk(Cl.bool(true));

			const join2 = simnet.callPublicFn(
				"sponsored-pool",
				"join",
				[],
				wallet2
			);
			expect(join2.result).toBeOk(Cl.bool(true));

			// Check state after players join
			const totalPlayersAfterJoin = simnet.callReadOnlyFn(
				"sponsored-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayersAfterJoin.result).toBeUint(3);

			// 3. Winner claims reward
			const rewardAmount = 30000000; // 30 STX reward
			const contractId = `${deployer}.sponsored-pool`;

			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			const claimResult = simnet.callPublicFn(
				"sponsored-pool",
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
				"sponsored-pool",
				"leave",
				[Cl.bufferFromHex(leaveSignature)],
				wallet2
			);
			expect(leaveResult.result).toBeOk(Cl.bool(true));

			// 5. Final state check - only deployer and winner remain
			const finalPlayers = simnet.callReadOnlyFn(
				"sponsored-pool",
				"get-total-players",
				[],
				deployer
			);
			expect(finalPlayers.result).toBeUint(2);

			// Check that winner has claimed reward
			const hasClaimed = simnet.callReadOnlyFn(
				"sponsored-pool",
				"has-claimed-reward",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(hasClaimed.result).toBeBool(true);

			// Check wallet2 is no longer in pool
			const wallet2Joined = simnet.callReadOnlyFn(
				"sponsored-pool",
				"has-player-joined",
				[Cl.standardPrincipal(wallet2)],
				deployer
			);
			expect(wallet2Joined.result).toBeBool(false);
		});
	});
});
