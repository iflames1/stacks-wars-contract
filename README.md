# Stacks Wars Smart Contracts

Stacks Wars is a **gaming utility platform** built on the **Stacks blockchain**, integrating various gaming experiences such as **casino games, sports betting, casual games, and aviator games**, all powered by **STX** as the primary mode of payment.

This repository contains the **Clarity smart contracts** that power the **Stacks Wars** ecosystem, handling **game logic, betting, and reward distribution** on-chain.

## 📌 Repository Overview

This repo includes:

-   **Game Contracts**: Smart contracts for different game types.
-   **Betting System**: Secure and transparent betting mechanisms.
-   **Token Integration**: STX-based transactions and rewards.
-   **Property-Based Testing**: Fuzz testing using Rendezvous to verify contract behavior.
-   **Governance Functions**: (Upcoming) Community-driven game voting & proposals.

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:

-   **[Clarinet](https://github.com/hirosystems/clarinet)**
-   **[Rendezvous](https://github.com/stacks-network/rendezvous)** (for fuzz testing)
-   Node.js (for running scripts if needed)

### Installation

Clone the repository:

```sh
git clone https://github.com/iflames1/stacks-wars-contract/
cd contracts
```

### Running Tests

To run standard tests:

```sh
bun install
bun test
```

### Running Fuzz Tests with Rendezvous

For property-based testing with Rendezvous:

```sh
# Run property tests for a specific contract with signature dialer
rv . <contract-name> test --dial=./dialer.cjs

# Run invariant tests for a specific contract with signature dialer
rv . <contract-name> invariant --dial=./dialer.cjs

# Examples:
rv . factory test --dial=./dialer.cjs
rv . sponsored-pool test --dial=./dialer.cjs
rv . sponsored-ft-pool test --dial=./dialer.cjs

# Run with increased number of test runs
rv . factory test --dial=./dialer.cjs --runs=100
```

The dialer provides automatic signature generation for authenticated functions like `leave` and `claim-reward`.

## 🔗 Related Repositories

-   **Main Stacks Wars Repository**: [Stacks Wars](https://github.com/iatomic1/stacks-wars)

## 📢 Contributing

Want to contribute? Open a PR or discuss in [Stacks Wars Telegram](https://t.me/stackswars)!

## 📄 License

**All Rights Reserved - Proprietary Software**

This software and its source code are the exclusive property of the Stacks Wars development team. Unauthorized copying, distribution, modification, or use of this software is strictly prohibited and may result in severe legal action including but not limited to:

-   Civil lawsuits for copyright infringement
-   Monetary damages and legal fees
-   Criminal prosecution where applicable

This software is protected by copyright law and international treaties. Any unauthorized use, reproduction, or distribution may result in significant financial penalties and legal consequences.

---

### 🚀 Join the Stacks Wars Movement!

Follow us on **[Twitter/X](https://x.com/StacksWars)** and stay updated with the latest game releases and community updates!
