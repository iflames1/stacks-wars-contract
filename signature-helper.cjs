// signature-helper.cjs - CommonJS version of the signature helper

const crypto = require("crypto");
const { generateWallet } = require("@stacks/wallet-sdk");
const {
	createStacksPrivateKey,
	signMessageHashRsv,
	tupleCV,
	uintCV,
	principalCV,
	serializeCV,
} = require("@stacks/transactions");

// Optional dotenv support
try {
	require("dotenv").config({ path: ".env.test" });
} catch (e) {
	// dotenv might not be available, continue anyway
}

/**
 * Gets the trusted signer private key from environment variables
 * Falls back to hardcoded key if not found in .env
 */
async function getSignerPrivateKey() {
	// Try to get from environment first
	const secretKey = process.env.TRUSTED_SIGNER_SECRET_KEY;

	if (secretKey) {
		const wallet = await generateWallet({ secretKey, password: "" });
		return wallet.accounts[0].stxPrivateKey;
	}

	// Fallback to a default private key for testing purposes
	return "753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601";
}

/**
 * Generates a signature for the given amount and claimer
 * @param {number} amount - The amount in microSTX
 * @param {string} claimerAddress - The address of the claimer
 * @param {string} contractAddress - The contract address
 * @returns {Promise<string>} The signature as a hex string
 */
async function generateSignature(amount, claimerAddress, contractAddress) {
	const message = tupleCV({
		amount: uintCV(amount),
		winner: principalCV(claimerAddress),
		contract: principalCV(contractAddress),
	});

	const serialized = serializeCV(message);
	const buffer = Buffer.from(serialized);
	const hash = crypto.createHash("sha256").update(buffer).digest();

	const privateKeyString = await getSignerPrivateKey();
	const privateKey = createStacksPrivateKey(privateKeyString);

	const signature = signMessageHashRsv({
		messageHash: hash.toString("hex"),
		privateKey,
	});

	return signature.data;
}

/**
 * Generates an invalid signature for testing error cases
 * @returns {string} An invalid 65-byte signature as hex string
 */
function generateInvalidSignature() {
	return "0".repeat(130); // Invalid 65-byte signature
}

/**
 * Generates a mock signature for testing
 * This is useful when you don't want to deal with actual crypto libraries in tests
 * @param {number} amount - The amount in microSTX
 * @param {string} claimerAddress - The address of the claimer
 * @param {string} contractAddress - The contract address
 * @returns {string} A deterministic mock signature
 */
function generateMockSignature(amount, claimerAddress, contractAddress) {
	// Create a deterministic "signature" based on the inputs
	const message = `${amount}:${claimerAddress}:${contractAddress}`;
	const hash = crypto.createHash("sha256").update(message).digest("hex");
	// Return a 65-byte signature (130 hex characters)
	return "0x" + hash.padEnd(130, "0");
}

module.exports = {
	generateSignature,
	generateInvalidSignature,
	generateMockSignature,
};
