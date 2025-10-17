import { createHash } from "crypto";
import { generateWallet } from "@stacks/wallet-sdk";
import {
	createStacksPrivateKey,
	signMessageHashRsv,
	tupleCV,
	uintCV,
	principalCV,
	serializeCV,
} from "@stacks/transactions";
import dotenv from "dotenv";
dotenv.config({ path: ".env.test" });

/**
 * Gets the trusted signer private key from environment variables
 * Falls back to hardcoded key if not found in .env
 */
const getSignerPrivateKey = async (): Promise<string> => {
	// Try to get from environment first
	const secretKey = process.env.TRUSTED_SIGNER_SECRET_KEY;

	if (secretKey) {
		const wallet = await generateWallet({ secretKey, password: "" });
		return wallet.accounts[0].stxPrivateKey;
	}

	// Fallback to a default private key for testing
	return "753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601";
};

/**
 * Generates a signature for the given amount and claimer
 * @param amount - The amount in microSTX
 * @param claimerAddress - The address of the claimer
 * @param contractAddress - The contract address
 * @returns The signature as a hex string
 */
export const generateSignature = async (
	amount: number,
	claimerAddress: string,
	contractAddress: string
): Promise<string> => {
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

/**
 * Generates an invalid signature for testing error cases
 * @returns An invalid 65-byte signature as hex string
 */
export const generateInvalidSignature = (): string => {
	return "0".repeat(130); // Invalid 65-byte signature
};
