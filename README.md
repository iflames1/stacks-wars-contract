# Stacks Wars Smart Contracts

Stacks Wars is a **gaming utility platform** built on the **Stacks blockchain**, integrating various gaming experiences such as **casino games, sports betting, casual games, and aviator games**, all powered by **STX** as the primary mode of payment.

This repository contains the **Clarity smart contracts** that power the **Stacks Wars** ecosystem, handling **game logic, betting, and reward distribution** on-chain.

## 📌 Repository Overview

This repo includes:

-   **Game Contracts**: Smart contracts for different game types.
-   **Betting System**: Secure and transparent betting mechanisms.
-   **Token Integration**: STX-based transactions and rewards.
-   **Governance Functions**: (Upcoming) Community-driven game voting & proposals.

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:

-   **[Clarinet](https://github.com/hirosystems/clarinet)**
-   Node.js (for running scripts if needed)

### Installation

Clone the repository:

```sh
git clone https://github.com/iflames1/stacks-wars-contract/
cd contracts
```

### Running Tests

To test the contracts locally, use:

```sh
npm install
npm test
```

## 🛠 Deployment

Contracts are deployed on the **Stacks testnet & mainnet**.

<!--Deploy using:

```sh
clarity-cli contract deploy <contract-name> --network testnet
```

Modify `<contract-name>` and **ensure the network is correctly set**.-->

<!--## 📜 Contract Details

-   **Game Logic Contract**: Manages the core game mechanics.
-   **Betting Contract**: Handles bets, payouts, and escrow.
-   **Governance Contract** (Upcoming): Enables community participation.

## 📡 Interacting with Contracts

Use **Stacks Explorer** or **Stacks.js** to interact with deployed contracts:

```js
import { StacksMocknet } from "@stacks/network";
import { callReadOnlyFunction } from "@stacks/transactions";

const network = new StacksMocknet();
const result = await callReadOnlyFunction({
	contractAddress: "SPXXXXXX",
	contractName: "stacks-wars-game",
	functionName: "get-game-status",
	functionArgs: [],
	senderAddress: "STXXXXXX",
	network,
});
```-->

## 🔗 Related Repositories

-   **Main Stacks Wars Repository**: [Stacks Wars](https://github.com/iatomic1/stacks-wars)

## 📢 Contributing

Want to contribute? Open a PR or discuss in [Stacks Wars Discord](https://discord.gg/YsgFKsf5U6)!

## 📄 License

This project is licensed under the **MIT License**.

---

### 🚀 Join the Stacks Wars Movement!

Follow us on **[Twitter/X](https://x.com/StacksWars)** and stay updated with the latest game releases and community updates!
