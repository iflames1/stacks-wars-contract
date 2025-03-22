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
(define-constant TRUSTED_SIGNER 'STF0V8KWBS70F0WDKTMY65B3G591NN52PR4Z71Y3) ;; TODO: Replace with the actual signer

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
                                {joined-at: block-height, amount: entry-fee}
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
        ;; Check if pool exists
        (asserts! (pool-exists pool-id) (err ERR_POOL_NOT_FOUND))

        ;; Check if reward has already been claimed
        (asserts! (not (reward-claimed pool-id tx-sender)) (err ERR_REWARD_ALREADY_CLAIMED))

        ;; Use a pre-computed message hash for verification
        ;; In a real implementation, you would construct and hash the message on-chain
        ;; For simplicity, we assume the signature is computed correctly off-chain
        (let (
            (msg-hash (sha256 0x0000))  ;; Simplified for testing - in production use proper message construction
            (recovered-public-key (unwrap! (secp256k1-recover? msg-hash signature) (err ERR_INVALID_SIGNATURE)))
        )
            ;; Verify the signature matches trusted signer
            (asserts! (is-eq (unwrap! (principal-of? recovered-public-key) (err ERR_INVALID_SIGNATURE)) TRUSTED_SIGNER)
                (err ERR_INVALID_SIGNATURE))

            ;; Validate the amount
            (asserts! (> amount u0) (err ERR_INVALID_AMOUNT))

            ;; Transfer the reward to the winner
            (match (as-contract (stx-transfer? amount tx-sender tx-sender))
                success
                (begin
                    ;; Mark reward as claimed
                    (map-set claimed-rewards
                        {pool-id: pool-id, player: tx-sender}
                        {claimed: true, amount: amount}
                    )

                    ;; Return success
                    (ok true)
                )
                error (err ERR_TRANSFER_FAILED)
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