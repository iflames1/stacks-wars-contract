import { generateSignature } from "./tests/helpers/signature-helper";
// factory-dialer.js - Pre-dialer for generating valid signatures for contract calls

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

	// Generate a signature for the ENTRY_FEE amount (5000000)
	const signature = generateSignature(5_000_000, txSender, contractAddr);

	// Replace the signature argument with our generated one
	// The signature is the first argument (index 0) of the leave function
	clarityValueArguments[0] = {
		type: 2, // Buffer type in Clarity Value representation
		value: signature,
	};
}

module.exports = {
	preLeaveSignature,
};
