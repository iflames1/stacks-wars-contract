;; ==============================
;; Stacks Wars - Pool Contract
;; ==============================
;; This contract allows users to create game pools with fixed entry fees.
;; Players can join pools by paying the specified fee.
;; Winners are determined off-chain and claim rewards using signed messages.

;; ----------------------
;; CONSTANTS
;; ----------------------

;; The principal that signs winner messages
(define-constant TRUSTED_SIGNER 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM) ;; TODO: Replace with the actual signer before deployment
(define-constant TRUSTED_PUBLIC_KEY 0x0390a5cac7c33fda49f70bc1b0866fa0ba7a9440d9de647fecb8132ceb76a94dfa)

;; Error codes
(define-constant ERR_POOL_ALREADY_EXISTS u1)
(define-constant ERR_INVALID_FEE u2)
(define-constant ERR_POOL_NOT_FOUND u3)
(define-constant ERR_ALREADY_JOINED u4)
(define-constant ERR_INSUFFICIENT_FUNDS u5)
(define-constant ERR_TRANSFER_FAILED u6)
(define-constant ERR_REWARD_ALREADY_CLAIMED u7)
(define-constant ERR_INVALID_SIGNATURE u8)
(define-constant ERR_INVALID_AMOUNT u9)
(define-constant ERR_INVALID_FORMAT u10)
(define-constant ERR_MAXIMUM_REWARD_EXCEEDED u11)
(define-constant ERR_REENTRANCY u12)

;; ----------------------
;; DATA STRUCTURES
;; ----------------------

;; Map to store pool details
(define-map pools
    {pool-id: uint}
    {owner: principal, entry-fee: uint, balance: uint, total-players: uint}
)

;; Map to track players in each pool
(define-map pool-players
    {pool-id: uint, player: principal}
    {joined-at: uint, amount: uint}
)

;; Map to track claimed rewards
(define-map claimed-rewards
    {pool-id: uint, player: principal}
    {claimed: bool, amount: uint}
)

;; Track when a function is already executing (reentrancy guard)
(define-data-var executing bool false)

;; A variable to track the next available pool ID
(define-data-var next-pool-id uint u1)

;; ----------------------
;; HELPER FUNCTIONS
;; ----------------------

;; Function to validate pool exists
(define-private (pool-exists (pool-id uint))
    (is-some (map-get? pools {pool-id: pool-id}))
)

;; Function to check if player is already in pool
(define-private (player-in-pool (pool-id uint) (player principal))
    (is-some (map-get? pool-players {pool-id: pool-id, player: player}))
)

;; Function to verify if a reward has already been claimed
(define-private (reward-claimed (pool-id uint) (player principal))
    (match (map-get? claimed-rewards {pool-id: pool-id, player: player})
        claimed-data (get claimed claimed-data)
        false
    )
)

;; Function to prevent reentrancy attacks - fixed implementation
(define-private (begin-execution)
    (begin
        (asserts! (not (var-get executing)) (err ERR_REENTRANCY))
        (var-set executing true)
        (ok true)
    )
)

(define-private (end-execution)
    (begin
        (var-set executing false)
        (ok true)
    )
)

;; ----------------------
;; PUBLIC FUNCTIONS
;; ----------------------

;; Function to create a new pool
;; - Accepts an `entry-fee` (fee required to join the pool)
;; - Generates a unique `pool-id` and stores the pool details
(define-public (create-pool (entry-fee uint))
    (let ((pool-id (var-get next-pool-id)))
        (begin
            ;; Check if entry fee is valid
            (asserts! (> entry-fee u0) (err ERR_INVALID_FEE))

            ;; Check if pool already exists (shouldn't happen with auto-increment)
            (asserts! (not (pool-exists pool-id)) (err ERR_POOL_ALREADY_EXISTS))

            ;; Store the pool details
            (map-set pools
                {pool-id: pool-id}
                {
                    owner: tx-sender,
                    entry-fee: entry-fee,
                    balance: u0,
                    total-players: u0
                }
            )

            ;; Increment the pool ID for the next pool
            (var-set next-pool-id (+ pool-id u1))

            ;; Return the pool ID to the caller
            (ok pool-id)
        )
    )
)

;; Function for players to join a pool by paying the entry fee
(define-public (join-pool (pool-id uint))
    (let (
        (pool-opt (map-get? pools {pool-id: pool-id}))
    )
        (match pool-opt
            pool-data
            (let (
                (entry-fee (get entry-fee pool-data))
                (current-balance (get balance pool-data))
                (total-players (get total-players pool-data))
            )
                (begin
                    ;; Check if player has already joined
                    (asserts! (not (player-in-pool pool-id tx-sender)) (err ERR_ALREADY_JOINED))

                    ;; Transfer STX from player to contract
                    (match (stx-transfer? entry-fee tx-sender (as-contract tx-sender))
                        success
                        (begin
                            ;; Record player's entry into the pool
                            (map-set pool-players
                                {pool-id: pool-id, player: tx-sender}
                                {joined-at: stacks-block-height, amount: entry-fee}
                            )

                            ;; Update pool data (balance and total players)
                            (map-set pools
                                {pool-id: pool-id}
                                {
                                    owner: (get owner pool-data),
                                    entry-fee: entry-fee,
                                    balance: (+ current-balance entry-fee),
                                    total-players: (+ total-players u1)
                                }
                            )

                            (ok true)
                        )
                        error (err ERR_TRANSFER_FAILED)
                    )
                )
            )
            (err ERR_POOL_NOT_FOUND)
        )
    )
)

;; Function for winners to claim rewards using signed messages
;; In this version, the signature is pre-calculated off-chain and verified on-chain
(define-public (claim-reward (pool-id uint) (amount uint) (signature (buff 65)))
    (begin
        ;; Apply reentrancy guard
        (try! (begin-execution))

        ;; Check if pool exists
        (asserts! (pool-exists pool-id) (err ERR_POOL_NOT_FOUND))

        ;; Check if reward has already been claimed
        (asserts! (not (reward-claimed pool-id tx-sender)) (err ERR_REWARD_ALREADY_CLAIMED))

        ;; Get pool data to check balance
        (let ((pool-data (unwrap! (map-get? pools {pool-id: pool-id}) (err ERR_POOL_NOT_FOUND))))
            ;; Ensure the amount doesn't exceed the pool balance
            (asserts! (<= amount (get balance pool-data)) (err ERR_MAXIMUM_REWARD_EXCEEDED))

            ;; Construct the message string in the format "pool-id-amount"
            ;; This must match the off-chain format: "2-5" for pool-id 2, amount 5
            (let (
                ;; Serialize data as Clarity values (no string conversion)
                (message {
                    pool-id: pool-id,
                    amount: amount,
                    winner: tx-sender
                }) ;; Bind tx-sender to the 'winner' field

                ;; Convert message to buffer and unwrap the optional before hashing
                (message-buff (to-consensus-buff? message))
                ;; Use the SHA-256 hash function on the unwrapped buffer
                (msg-hash (sha256 (unwrap! message-buff (err ERR_INVALID_FORMAT))))
            )
                ;; Directly verify the signature against the trusted public key
                (asserts! (secp256k1-verify msg-hash signature TRUSTED_PUBLIC_KEY)
                        (err ERR_INVALID_SIGNATURE))

                ;; Ensure the claimed amount is greater than zero
                (asserts! (> amount u0) (err ERR_INVALID_AMOUNT))

                ;; Transfer the reward from the contract to the user
                (match (as-contract (stx-transfer? amount tx-sender tx-sender))
                    success
                    (begin
                        ;; Mark the reward as claimed
                        (map-set claimed-rewards
                            {pool-id: pool-id, player: tx-sender}
                            {claimed: true, amount: amount}
                        )

                        ;; Update pool balance
                        (map-set pools
                            {pool-id: pool-id}
                            {
                                owner: (get owner pool-data),
                                entry-fee: (get entry-fee pool-data),
                                balance: (- (get balance pool-data) amount),
                                total-players: (get total-players pool-data)
                            }
                        )

                        ;; End execution (release the reentrancy guard)
                        (var-set executing false)
                        (ok true)
                    )
                    error
                    (begin
                        ;; Make sure to release the guard even on failure
                        (var-set executing false)
                        (err ERR_TRANSFER_FAILED)
                    )
                )
            )
        )
    )
)

;; ----------------------
;; READ-ONLY FUNCTIONS
;; ----------------------

;; Function to get pool details
(define-read-only (get-pool-details (pool-id uint))
    (map-get? pools {pool-id: pool-id})
)

;; Function to check if a player has joined a pool
(define-read-only (has-player-joined (pool-id uint) (player principal))
    (is-some (map-get? pool-players {pool-id: pool-id, player: player}))
)

;; Function to check if a player has claimed their reward
(define-read-only (has-claimed-reward (pool-id uint) (player principal))
    (default-to false
        (get claimed (map-get? claimed-rewards {pool-id: pool-id, player: player}))
    )
)

;; Function to get pool balance
(define-read-only (get-pool-balance (pool-id uint))
    (match (map-get? pools {pool-id: pool-id})
        pool-data (get balance pool-data)
        u0
    )
)

;; Function to get total players in a pool
(define-read-only (get-pool-players-count (pool-id uint))
    (match (map-get? pools {pool-id: pool-id})
        pool-data (get total-players pool-data)
        u0
    )
)
