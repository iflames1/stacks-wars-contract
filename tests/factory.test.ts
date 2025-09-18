import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";
import {
	principalCV,
	serializeCV,
	signMessageHashRsv,
	tupleCV,
	uintCV,
	createStacksPrivateKey,
} from "@stacks/transactions";
import { generateWallet } from "@stacks/wallet-sdk";
import { createHash } from "crypto";

const accounts = simnet.getAccounts();
const deployer = simnet.deployer;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

// Helper function to generate signatures for testing
const getSignerPrivateKey = async () => {
	const secretKey =
		"unfold wine clarify fiscal entire phrase stadium mushroom best junior guard wreck huge chase target social casual plunge project field spider spare laptop gospel";
	const wallet = await generateWallet({ secretKey, password: "" });
	return wallet.accounts[0].stxPrivateKey;
};

const generateSignature = async (
	amount: number,
	claimerAddress: string,
	contractAddress: string
) => {
	const message = tupleCV({
		amount: uintCV(amount),
		winner: principalCV(claimerAddress),
		contract: principalCV(contractAddress),
	});
	const serialized = serializeCV(message);
	const buffer = Buffer.from(serialized);
	const hash = createHash("sha256").update(buffer).digest();

	const privateKeyString = await getSignerPrivateKey();
	const privateKey = createStacksPrivateKey(privateKeyString);

	const signature = signMessageHashRsv({
		messageHash: hash.toString("hex"),
		privateKey,
	});

	return signature.data;
};

describe("Factory Contract Tests", () => {
	beforeEach(() => {
		// Each test starts with a fresh simnet state
	});

	describe("Initial State", () => {
		it("should have zero players initially", () => {
			const result = simnet.callReadOnlyFn(
				"factory",
				"get-total-players",
				[],
				deployer
			);
			expect(result.result).toBeUint(0);
		});

		it("should have zero pool balance initially", () => {
			const result = simnet.callReadOnlyFn(
				"factory",
				"get-pool-balance",
				[],
				deployer
			);
			expect(result.result).toBeUint(0);
		});

		it("should return false for player joined check initially", () => {
			const result = simnet.callReadOnlyFn(
				"factory",
				"has-player-joined",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(result.result).toBeBool(false);
		});
	});

	describe("Join Pool Function", () => {
		it("should allow deployer to join first", () => {
			const result = simnet.callPublicFn("factory", "join", [], deployer);

			expect(result.result).toBeOk(Cl.bool(true));

			// Check STX transfer event
			expect(result.events).toContainEqual({
				event: "stx_transfer_event",
				data: {
					amount: "5000000", // ENTRY_FEE
					sender: deployer,
					recipient: `${deployer}.factory`,
					memo: "",
				},
			});
		});

		it("should update contract state after deployer joins", () => {
			// Deployer joins
			simnet.callPublicFn("factory", "join", [], deployer);

			// Check total players
			const totalPlayers = simnet.callReadOnlyFn(
				"factory",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(1);

			// Check pool balance
			const poolBalance = simnet.callReadOnlyFn(
				"factory",
				"get-pool-balance",
				[],
				deployer
			);
			expect(poolBalance.result).toBeUint(5000000);

			// Check deployer has joined
			const hasJoined = simnet.callReadOnlyFn(
				"factory",
				"has-player-joined",
				[Cl.standardPrincipal(deployer)],
				deployer
			);
			expect(hasJoined.result).toBeBool(true);
		});

		it("should allow other players to join after deployer", () => {
			// Deployer joins first
			simnet.callPublicFn("factory", "join", [], deployer);

			// Wallet1 joins
			const result = simnet.callPublicFn("factory", "join", [], wallet1);

			expect(result.result).toBeOk(Cl.bool(true));

			// Check total players is now 2
			const totalPlayers = simnet.callReadOnlyFn(
				"factory",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(2);

			// Check pool balance is now 10 STX
			const poolBalance = simnet.callReadOnlyFn(
				"factory",
				"get-pool-balance",
				[],
				deployer
			);
			expect(poolBalance.result).toBeUint(10000000);
		});

		it("should prevent players from joining twice", () => {
			// Player joins first time
			simnet.callPublicFn("factory", "join", [], deployer);

			// Try to join again
			const result = simnet.callPublicFn("factory", "join", [], deployer);

			expect(result.result).toBeErr(Cl.uint(5)); // ERR_ALREADY_JOINED
		});

		it("should prevent non-deployer from joining when pool is empty", () => {
			const result = simnet.callPublicFn("factory", "join", [], wallet1);

			expect(result.result).toBeErr(Cl.uint(15)); // ERR_NOT_JOINABLE
		});
	});

	describe("Claim Reward Function", () => {
		beforeEach(() => {
			// Setup: deployer joins to enable others to join
			simnet.callPublicFn("factory", "join", [], deployer);
			simnet.callPublicFn("factory", "join", [], wallet1);
		});

		it("should allow player to claim reward with valid signature", async () => {
			const rewardAmount = 10000000; // 10 STX
			const contractId = `${deployer}.factory`;

			// Generate valid signature
			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			const result = simnet.callPublicFn(
				"factory",
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
					sender: `${deployer}.factory`,
					recipient: "SP39V8Q7KATNA4B0ZKD6QNTMHDNH5VJXRBG7PB8G2", // fee wallet
				}),
			});

			expect(result.events).toContainEqual({
				event: "stx_transfer_event",
				data: expect.objectContaining({
					amount: "9800000", // 98% of reward
					sender: `${deployer}.factory`,
					recipient: wallet1,
				}),
			});
		});

		it("should prevent claiming reward twice", async () => {
			const rewardAmount = 10000000;
			const contractId = `${deployer}.factory`;

			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			// First claim should succeed
			const firstClaim = simnet.callPublicFn(
				"factory",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);
			expect(firstClaim.result).toBeOk(Cl.bool(true));

			// Second claim should fail
			const secondClaim = simnet.callPublicFn(
				"factory",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);
			expect(secondClaim.result).toBeErr(Cl.uint(9)); // ERR_REWARD_ALREADY_CLAIMED
		});

		it("should reject invalid signature", () => {
			const rewardAmount = 10000000;
			const invalidSignature = "0".repeat(130); // Invalid 65-byte signature

			const result = simnet.callPublicFn(
				"factory",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(invalidSignature)],
				wallet1
			);

			expect(result.result).toBeErr(Cl.uint(10)); // ERR_INVALID_SIGNATURE
		});

		it("should update claimed reward status", async () => {
			const rewardAmount = 10000000;
			const contractId = `${deployer}.factory`;

			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			// Claim reward
			simnet.callPublicFn(
				"factory",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);

			// Check claimed status
			const hasClaimed = simnet.callReadOnlyFn(
				"factory",
				"has-claimed-reward",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(hasClaimed.result).toBeBool(true);
		});
	});

	describe("Leave Pool Function", () => {
		beforeEach(() => {
			// Setup: players join
			simnet.callPublicFn("factory", "join", [], deployer);
			simnet.callPublicFn("factory", "join", [], wallet1);
		});

		it("should allow player to leave with valid signature", async () => {
			const entryFee = 5000000; // ENTRY_FEE
			const contractId = `${deployer}.factory`;

			const signature = await generateSignature(
				entryFee,
				wallet1,
				contractId
			);

			const result = simnet.callPublicFn(
				"factory",
				"leave",
				[Cl.bufferFromHex(signature)],
				wallet1
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// Check refund event
			expect(result.events).toContainEqual({
				event: "stx_transfer_event",
				data: {
					amount: "5000000",
					sender: `${deployer}.factory`,
					recipient: wallet1,
					memo: "",
				},
			});
		});

		it("should update state after player leaves", async () => {
			const entryFee = 5000000;
			const contractId = `${deployer}.factory`;

			const signature = await generateSignature(
				entryFee,
				wallet1,
				contractId
			);

			// Player leaves
			simnet.callPublicFn(
				"factory",
				"leave",
				[Cl.bufferFromHex(signature)],
				wallet1
			);

			// Check total players decreased
			const totalPlayers = simnet.callReadOnlyFn(
				"factory",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(1);

			// Check player no longer joined
			const hasJoined = simnet.callReadOnlyFn(
				"factory",
				"has-player-joined",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(hasJoined.result).toBeBool(false);
		});

		it("should prevent non-joined player from leaving", async () => {
			const entryFee = 5000000;
			const contractId = `${deployer}.factory`;

			const signature = await generateSignature(
				entryFee,
				wallet2, // wallet2 hasn't joined
				contractId
			);

			const result = simnet.callPublicFn(
				"factory",
				"leave",
				[Cl.bufferFromHex(signature)],
				wallet2
			);

			expect(result.result).toBeErr(Cl.uint(14)); // ERR_NOT_JOINED
		});
	});

	describe("Kick Function", () => {
		beforeEach(() => {
			// Setup: players join
			simnet.callPublicFn("factory", "join", [], deployer);
			simnet.callPublicFn("factory", "join", [], wallet1);
			simnet.callPublicFn("factory", "join", [], wallet2);
		});

		it("should allow deployer to kick player", () => {
			const result = simnet.callPublicFn(
				"factory",
				"kick",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);

			expect(result.result).toBeOk(Cl.bool(true));

			// Check refund event
			expect(result.events).toContainEqual({
				event: "stx_transfer_event",
				data: {
					amount: "5000000",
					sender: `${deployer}.factory`,
					recipient: wallet1,
					memo: "",
				},
			});
		});

		it("should update state after kick", () => {
			// Kick player
			simnet.callPublicFn(
				"factory",
				"kick",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);

			// Check player removed
			const hasJoined = simnet.callReadOnlyFn(
				"factory",
				"has-player-joined",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);
			expect(hasJoined.result).toBeBool(false);

			// Check total players decreased
			const totalPlayers = simnet.callReadOnlyFn(
				"factory",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(2);
		});

		it("should prevent non-deployer from kicking", () => {
			const result = simnet.callPublicFn(
				"factory",
				"kick",
				[Cl.standardPrincipal(wallet2)],
				wallet1 // wallet1 is not deployer
			);

			expect(result.result).toBeErr(Cl.uint(16)); // ERR_UNAUTHORIZED
		});

		it("should prevent kicking non-existent player", () => {
			const result = simnet.callPublicFn(
				"factory",
				"kick",
				[Cl.standardPrincipal(wallet3)], // wallet3 hasn't joined
				deployer
			);

			expect(result.result).toBeErr(Cl.uint(14)); // ERR_NOT_JOINED
		});

		it("should prevent deployer from kicking themselves", () => {
			const result = simnet.callPublicFn(
				"factory",
				"kick",
				[Cl.standardPrincipal(deployer)],
				deployer
			);

			expect(result.result).toBeErr(Cl.uint(16)); // ERR_UNAUTHORIZED
		});

		it("should prevent kicking player who claimed reward", async () => {
			// Player claims reward first
			const rewardAmount = 10000000;
			const contractId = `${deployer}.factory`;

			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			simnet.callPublicFn(
				"factory",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);

			// Try to kick player who claimed reward
			const kickResult = simnet.callPublicFn(
				"factory",
				"kick",
				[Cl.standardPrincipal(wallet1)],
				deployer
			);

			expect(kickResult.result).toBeErr(Cl.uint(9)); // ERR_REWARD_ALREADY_CLAIMED
		});
	});

	describe("Integration Workflow", () => {
		it("should handle complete game workflow", async () => {
			// 1. Deployer starts pool
			const deployerJoin = simnet.callPublicFn(
				"factory",
				"join",
				[],
				deployer
			);
			expect(deployerJoin.result).toBeOk(Cl.bool(true));

			// 2. Players join
			const player1Join = simnet.callPublicFn(
				"factory",
				"join",
				[],
				wallet1
			);
			const player2Join = simnet.callPublicFn(
				"factory",
				"join",
				[],
				wallet2
			);
			expect(player1Join.result).toBeOk(Cl.bool(true));
			expect(player2Join.result).toBeOk(Cl.bool(true));

			// Check pool has 3 players and 15 STX
			const totalPlayers = simnet.callReadOnlyFn(
				"factory",
				"get-total-players",
				[],
				deployer
			);
			expect(totalPlayers.result).toBeUint(3);

			const poolBalance = simnet.callReadOnlyFn(
				"factory",
				"get-pool-balance",
				[],
				deployer
			);
			expect(poolBalance.result).toBeUint(15000000);

			// 3. Winner claims reward
			const rewardAmount = 8000000; // 8 STX reward (leaving 7 STX for refunds)
			const contractId = `${deployer}.factory`;

			const signature = await generateSignature(
				rewardAmount,
				wallet1,
				contractId
			);

			const claimResult = simnet.callPublicFn(
				"factory",
				"claim-reward",
				[Cl.uint(rewardAmount), Cl.bufferFromHex(signature)],
				wallet1
			);
			expect(claimResult.result).toBeOk(Cl.bool(true));

			// 4. Other player leaves
			const leaveSignature = await generateSignature(
				5000000, // ENTRY_FEE
				wallet2,
				contractId
			);

			const leaveResult = simnet.callPublicFn(
				"factory",
				"leave",
				[Cl.bufferFromHex(leaveSignature)],
				wallet2
			);
			expect(leaveResult.result).toBeOk(Cl.bool(true));

			// Final state check
			const finalPlayers = simnet.callReadOnlyFn(
				"factory",
				"get-total-players",
				[],
				deployer
			);
			expect(finalPlayers.result).toBeUint(2); // deployer and wallet1 remain
		});
	});
});
