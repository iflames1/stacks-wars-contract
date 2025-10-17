// factory-dialer.cjs - Pre-dialer for generating valid signatures for contract calls
const { generateSignature, generateMockSignature } = require('./signature-helper.cjs');

/**
 * Pre-dialer function for the leave function
 * This runs before the function is called and modifies the arguments
 */
async function preLeaveSignature(context) {
	const { selectedFunction, clarityValueArguments } = context;

	// Only modify arguments for the leave function
	if (selectedFunction.name !== "leave") return;

	// Get the current tx-sender (wallet making the call)
	const txSender = context.session.accounts[context.txSender].address;

	// Get the contract address
	const contractAddr =
		context.session.contracts[context.targetContract].identifier;

	// Try to use actual signature generation, fallback to mock if it fails
	let signature;
	try {
		signature = await generateSignature(
			5_000_000,
			txSender,
			contractAddr
		);
	} catch (e) {
		console.log("Using mock signature generation due to:", e.message);
		signature = generateMockSignature(
			5_000_000,
			txSender,
			contractAddr
		);
	}

	// Replace the signature argument with our generated one
	// The signature is the first argument (index 0) of the leave function
	clarityValueArguments[0] = {
		type: 2, // Buffer type in Clarity Value representation
		value: signature,
	};
}

/**
 * Pre-dialer function for the claim-reward function
 * This runs before the function is called and modifies the arguments
 */
async function preClaimRewardSignature(context) {
	const { selectedFunction, clarityValueArguments } = context;

	// Only modify arguments for the claim-reward function
	if (selectedFunction.name !== "claim-reward") return;

	// Get the current tx-sender (wallet making the call)
	const txSender = context.session.accounts[context.txSender].address;

	// Get the contract address
	const contractAddr =
		context.session.contracts[context.targetContract].identifier;

	// Get the amount being claimed (first argument)
	const amount = Number(clarityValueArguments[0].value);

	// Try to use actual signature generation, fallback to mock if it fails
	let signature;
	try {
		signature = await generateSignature(amount, txSender, contractAddr);
	} catch (e) {
		console.log("Using mock signature generation due to:", e.message);
		signature = generateMockSignature(amount, txSender, contractAddr);
	}

	// Replace the signature argument with our generated one
	// The signature is the second argument (index 1) of the claim-reward function
	clarityValueArguments[1] = {
		type: 2, // Buffer type in Clarity Value representation
		value: signature,
	};
}

module.exports = {
	pre: [preLeaveSignature, preClaimRewardSignature],
	post: [],
};
