# Signature Helper

This helper file provides utilities for generating signatures in tests for the Stacks Wars contracts.

## Features

-   **Environment-based configuration**: Reads the trusted signer secret key from `.env` file
-   **Fallback support**: Falls back to hardcoded key if environment variable is not set
-   **Reusable functions**: Can be used across all test files
-   **Invalid signature generation**: Provides utility for testing error cases

## Usage

### Basic signature generation

```typescript
import { generateSignature } from "./helpers/signature-helper";

// Generate a valid signature for claiming rewards
const signature = await generateSignature(
	10000000, // amount in microSTX
	wallet1, // claimer address
	`${deployer}.factory` // contract address
);

// Use in test
const result = simnet.callPublicFn(
	"factory",
	"claim-reward",
	[Cl.uint(10000000), Cl.bufferFromHex(signature)],
	wallet1
);
```

### Invalid signature for error testing

```typescript
import { generateInvalidSignature } from "./helpers/signature-helper";

const invalidSignature = generateInvalidSignature();

const result = simnet.callPublicFn(
	"factory",
	"claim-reward",
	[Cl.uint(10000000), Cl.bufferFromHex(invalidSignature)],
	wallet1
);

expect(result.result).toBeErr(Cl.uint(10)); // ERR_INVALID_SIGNATURE
```

## Environment Setup

Add your trusted signer secret key to `.env`:

```
TRUSTED_SIGNER_SECRET_KEY="your-secret-key-here"
```

If not provided, the helper will fall back to a hardcoded key for testing purposes.

## Contract-specific Usage

### Factory Contract

-   Use ENTRY_FEE amount (5000000) for leave signatures
-   Use reward amounts for claim-reward signatures

### Sponsored Pool Contract

-   Use 0 for regular player leave signatures (no refund)
-   Use POOL_SIZE (50000000) for sponsor leave signatures
-   Use reward amounts for claim-reward signatures

### Sponsored FT Pool Contract

-   Similar to sponsored pool but with token transfers instead of STX
