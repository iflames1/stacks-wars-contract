;; ==============================
;; Stacks Wars - Pool Contract
;; ==============================
;; author: flames.stx
;; summary: A pool where players join by paying a fixed entry fee.
;; Winners are determined off-chain and claim rewards using signed messages.

;; ----------------------
;; CONSTANTS
;; ----------------------

(define-constant STACKS_WARS_FEE_WALLET 'SP39V8Q7KATNA4B0ZKD6QNTMHDNH5VJXRBG7PB8G2)
;; Trusted signer for winner verification
(define-constant TRUSTED_PUBLIC_KEY 0x03ffe7c30724197e226ddc09b6340c078e7f42e3751c3d0654d067798850d22d09)

(define-constant DEPLOYER 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM)

;; Fixed entry fee for all players
(define-constant ENTRY_FEE u5000000)
;; Fee percentage for the pool
(define-constant FEE_PERCENTAGE u2)

(define-constant CONTRACT (as-contract tx-sender))

;; Error codes
(define-constant ERR_ALREADY_JOINED u5)
(define-constant ERR_INSUFFICIENT_FUNDS u6)
(define-constant ERR_TRANSFER_FAILED u7)
(define-constant ERR_FEE_TRANSFER_FAILED u8)
(define-constant ERR_REWARD_ALREADY_CLAIMED u9)
(define-constant ERR_INVALID_SIGNATURE u10)
(define-constant ERR_INVALID_AMOUNT u11)
(define-constant ERR_MAXIMUM_REWARD_EXCEEDED u12)
(define-constant ERR_REENTRANCY u13)
(define-constant ERR_NOT_JOINED u14)
(define-constant ERR_NOT_JOINABLE u15)

;; ----------------------
;; DATA VARIABLES
;; ----------------------

;; Track total number of players
(define-data-var total-players uint u0)

;; Track players who joined the pool
(define-map players {player: principal} {joined-at: uint})

;; Track claimed rewards
(define-map claimed-rewards {player: principal} {claimed: bool, amount: uint})

;; Track collected fees to prevent double charging
(define-map collected-fees {player: principal} {paid: bool})

;; Reentrancy guard
(define-data-var executing bool false)

;; ----------------------
;; HELPER FUNCTIONS
;; ----------------------

(define-private (begin-execution)
    (begin
        (asserts! (not (var-get executing)) (err ERR_REENTRANCY))
        (var-set executing true)
        (ok true)
    )
)

(define-private (construct-message-hash (amount uint))
    (let ((message {amount: amount, winner: tx-sender}))
        (match (to-consensus-buff? message)
            buff (ok (sha256 buff))
            (err ERR_INVALID_AMOUNT)
        )
    )
)

;; ----------------------
;; PUBLIC FUNCTIONS
;; ----------------------

;; Players join the shared pool by paying the fixed entry fee
(define-public (join-pool)
    (begin
        ;; Check if player has already joined
        (asserts! (not (is-some (map-get? players {player: tx-sender}))) (err ERR_ALREADY_JOINED))

        ;; Allow joining only if:
        ;; - The pool is NOT empty, OR
        ;; - The sender IS the deployer
        (asserts! (or
            (not (is-eq (get-total-players) u0))
            (is-eq tx-sender DEPLOYER))
        (err ERR_NOT_JOINABLE))

        ;; Transfer STX from player to contract
        (match (stx-transfer? ENTRY_FEE tx-sender (as-contract tx-sender))
            success
            (begin
                ;; Record player's entry
                (map-set players {player: tx-sender} {joined-at: stacks-block-height})

                ;; Update player count
                (var-set total-players (+ (var-get total-players) u1))
                (ok true)
            )
            error (err ERR_TRANSFER_FAILED)
        )
    )
)

;; Winners claim rewards using signed messages
(define-public (claim-reward (amount uint) (signature (buff 65)))
    (begin
        ;; Apply reentrancy guard
        (try! (begin-execution))

        ;; Check if reward has already been claimed
        (asserts! (not (is-some (map-get? claimed-rewards {player: tx-sender}))) (err ERR_REWARD_ALREADY_CLAIMED))

        ;; Construct message hash for verification
        (let (
            (msg-hash (try! (construct-message-hash amount)))
            (recipient tx-sender)  ;; Store original sender in recipient
            (fee (/ (* amount FEE_PERCENTAGE) u100))
            (net-amount (- amount fee))
            (has-paid-fee (has-paid-entry-fee tx-sender))
        )
            ;; Verify signature
            (asserts! (secp256k1-verify msg-hash signature TRUSTED_PUBLIC_KEY) (err ERR_INVALID_SIGNATURE))

            ;; Ensure contract has enough balance for both fee and net amount
            (asserts! (>= (stx-get-balance (as-contract tx-sender)) amount) (err ERR_INSUFFICIENT_FUNDS))

            ;; handle the fee payment
            (let ((fee-result
                (if (not has-paid-fee)
                    ;; Transfer fee if not already paid
                    (match (as-contract (stx-transfer? fee tx-sender STACKS_WARS_FEE_WALLET))
                        fee-success
                        (begin
                            ;; Mark fee as collected
                            (map-set collected-fees {player: tx-sender} {paid: true})
                            (ok true)
                        )
                        error (begin
                            (var-set executing false)
                            (err ERR_FEE_TRANSFER_FAILED)
                        )
                    )
                    (ok true)
                )))

                ;; Check if fee payment was successful
                (try! fee-result)

                ;; Second transfer: Send net reward to player
                (match (as-contract (stx-transfer? net-amount tx-sender recipient))
                    reward-success
                    (begin
                        ;; Mark reward as claimed
                        (map-set claimed-rewards {player: recipient} {claimed: true, amount: amount})

                        ;; End execution (release the reentrancy guard)
                        (var-set executing false)
                        (ok true)
                    )
                    error
                    (begin
                        (var-set executing false)
                        (err ERR_TRANSFER_FAILED)
                    )
                )
            )
        )
    )
)

;; Players leave the pool and get refunded with a verified signature
(define-public (leave-pool (signature (buff 65)))
    (begin
        ;; Apply reentrancy guard
        (try! (begin-execution))

        ;; Ensure player has joined the pool
        (asserts! (is-some (map-get? players {player: tx-sender})) (err ERR_NOT_JOINED))

        ;; Ensure contract has enough balance for refund
        (asserts! (>= (stx-get-balance (as-contract tx-sender)) ENTRY_FEE) (err ERR_INSUFFICIENT_FUNDS))

        ;; Construct message hash for verification
        (let (
            (msg-hash (try! (construct-message-hash ENTRY_FEE)))
            (recipient tx-sender)  ;; Store original sender in recipient
            )

            ;; Verify signature
            (asserts! (secp256k1-verify msg-hash signature TRUSTED_PUBLIC_KEY) (err ERR_INVALID_SIGNATURE))

            ;; Transfer refund to player
            (match (as-contract (stx-transfer? ENTRY_FEE tx-sender recipient))
                success
                (begin
                    ;; Remove player from the pool
                    (map-delete players {player: tx-sender})

                    ;; Update player count
                    (var-set total-players (- (var-get total-players) u1))

                    ;; End execution (release the reentrancy guard)
                    (var-set executing false)
                    (ok true)
                )
                error
                (begin
                    ;; End execution (release the reentrancy guard)
                    (var-set executing false)
                    (err ERR_TRANSFER_FAILED)
                )
            )
        )
    )
)

;; ----------------------
;; READ-ONLY FUNCTIONS
;; ----------------------

;; Get total pool balance (actual contract balance)
(define-read-only (get-pool-balance)
    (stx-get-balance (as-contract tx-sender))
)

;; Get total number of players
(define-read-only (get-total-players)
    (var-get total-players)
)

;; Check if a player has joined
(define-read-only (has-player-joined (player principal))
    (is-some (map-get? players {player: player}))
)

;; Check if a player has claimed their reward
(define-read-only (has-claimed-reward (player principal))
    (default-to false (get claimed (map-get? claimed-rewards {player: player})))
)

;; Check if a player has paid the entry fee
(define-read-only (has-paid-entry-fee (player principal))
    (default-to false (get paid (map-get? collected-fees {player: player})))
)