;; ==============================
;; Stacks Wars - Sweepers Pool Contract
;; ==============================
;; author: flames.stx
;; summary: Multi-deposit gaming pool for Stacks Sweepers

;; ----------------------
;; CONSTANTS
;; ----------------------

(define-constant TRUSTED_PUBLIC_KEY 0x03ffe7c30724197e226ddc09b6340c078e7f42e3751c3d0654d067798850d22d09)
(define-constant DEPLOYER tx-sender)

;; ----------------------
;; Error codes
;; ----------------------

(define-constant ERR_INSUFFICIENT_FUNDS u6)
(define-constant ERR_TRANSFER_FAILED u7)
(define-constant ERR_INVALID_SIGNATURE u10)
(define-constant ERR_INVALID_AMOUNT u11)
(define-constant ERR_UNAUTHORIZED u16)
(define-constant ERR_DEPOSIT_NOT_FOUND u18)
(define-constant ERR_DEPOSIT_NOT_VALID u19)
(define-constant ERR_DEPOSIT_ALREADY_CLAIMED u20)

;; ----------------------
;; DATA VARIABLES
;; ----------------------

(define-data-var next-deposit-id uint u1)

;; ----------------------
;; DATA MAPS
;; ----------------------

;; Main deposits map using player + deposit-id as composite key
(define-map deposits
    {player: principal, deposit-id: uint}
    {amount: uint, valid: bool, deposited-at: uint}
)

;; Track player's claimed deposits to prevent double claiming
(define-map claimed-deposits
    {player: principal, deposit-id: uint}
    {claimed: bool, amount: uint}
)

;; Track deposits that were marked as lost by deployer
(define-map lost-deposits
    {player: principal, deposit-id: uint}
    {lost: bool, original-amount: uint}
);; ----------------------
;; HELPER FUNCTIONS
;; ----------------------

(define-private (construct-message-hash (deposit-id uint) (amount uint))
    (let ((message {
        deposit-id: deposit-id,
        amount: amount,
        winner: tx-sender,
        }))
        (match (to-consensus-buff? message)
            buff (ok (sha256 buff))
            (err ERR_INVALID_AMOUNT)
        )
    )
)

;; ----------------------
;; PUBLIC FUNCTIONS
;; ----------------------

(define-public (deposit (amount uint))
    (begin
        ;; Ensure amount is greater than 0
        (asserts! (> amount u0) (err ERR_INVALID_AMOUNT))

        ;; Get current deposit ID
        (let ((deposit-id (var-get next-deposit-id)))
            ;; Transfer STX from player to contract
            (match (stx-transfer? amount tx-sender (as-contract tx-sender))
                success
                (begin
                    ;; Store deposit information
                    (map-set deposits
                        {player: tx-sender, deposit-id: deposit-id}
                        {amount: amount, valid: true, deposited-at: stacks-block-height}
                    )

                    ;; Increment next deposit ID
                    (var-set next-deposit-id (+ deposit-id u1))

                    ;; Return the deposit ID
                    (ok deposit-id)
                )
                error (err ERR_TRANSFER_FAILED)
            )
        )
    )
)

(define-public (claim (deposit-id uint) (amount uint) (signature (buff 65)))
    (begin
        ;; Check if deposit exists and is valid
        (let ((deposit-data (unwrap! (map-get? deposits {player: tx-sender, deposit-id: deposit-id}) (err ERR_DEPOSIT_NOT_FOUND))))
            ;; Ensure deposit is still valid
            (asserts! (get valid deposit-data) (err ERR_DEPOSIT_NOT_VALID))

            ;; Ensure deposit hasn't been claimed already
            (asserts! (not (is-some (map-get? claimed-deposits {player: tx-sender, deposit-id: deposit-id}))) (err ERR_DEPOSIT_ALREADY_CLAIMED))

            (let (
                (msg-hash (try! (construct-message-hash deposit-id amount)))
                (recipient tx-sender)
            )
                ;; Verify signature
                (asserts! (secp256k1-verify msg-hash signature TRUSTED_PUBLIC_KEY) (err ERR_INVALID_SIGNATURE))

                ;; Ensure contract has enough balance
                (asserts! (>= (stx-get-balance (as-contract tx-sender)) amount) (err ERR_INSUFFICIENT_FUNDS))

                ;; Transfer amount to player
                (match (as-contract (stx-transfer? amount tx-sender recipient))
                    reward-success
                    (begin
                        ;; Mark deposit as invalid (used)
                        (map-set deposits
                            {player: tx-sender, deposit-id: deposit-id}
                            {amount: (get amount deposit-data), valid: false, deposited-at: (get deposited-at deposit-data)}
                        )

                        ;; Record claim
                        (map-set claimed-deposits
                            {player: recipient, deposit-id: deposit-id}
                            {claimed: true, amount: amount}
                        )

                        (ok true)
                    )
                    reward-error (err ERR_TRANSFER_FAILED)
                )
            )
        )
    )
)

(define-public (mark-deposit-lost (player principal) (deposit-id uint))
    (begin
        ;; Only deployer can mark deposits as lost
        (asserts! (is-eq tx-sender DEPLOYER) (err ERR_UNAUTHORIZED))

        ;; Check if deposit exists
        (let ((deposit-data (unwrap! (map-get? deposits {player: player, deposit-id: deposit-id}) (err ERR_DEPOSIT_NOT_FOUND))))
            ;; Ensure deposit is currently valid
            (asserts! (get valid deposit-data) (err ERR_DEPOSIT_NOT_VALID))

            ;; Mark deposit as invalid (lost)
            (map-set deposits
                {player: player, deposit-id: deposit-id}
                {amount: (get amount deposit-data), valid: false, deposited-at: (get deposited-at deposit-data)}
            )

            ;; Record lost deposit
            (map-set lost-deposits
                {player: player, deposit-id: deposit-id}
                {lost: true, original-amount: (get amount deposit-data)}
            )

            (ok true)
        )
    )
)

(define-public (fund (amount uint))
    (begin
        ;; Anyone can fund the contract
        (asserts! (> amount u0) (err ERR_INVALID_AMOUNT))

        ;; Transfer STX from sender to contract
        (match (stx-transfer? amount tx-sender (as-contract tx-sender))
            success (ok true)
            error (err ERR_TRANSFER_FAILED)
        )
    )
)

(define-public (withdraw (amount uint))
    (begin
        ;; Only deployer can withdraw
        (asserts! (is-eq tx-sender DEPLOYER) (err ERR_UNAUTHORIZED))

        ;; Ensure amount is greater than 0
        (asserts! (> amount u0) (err ERR_INVALID_AMOUNT))

        ;; Ensure contract has enough balance
        (asserts! (>= (stx-get-balance (as-contract tx-sender)) amount) (err ERR_INSUFFICIENT_FUNDS))

        ;; Transfer STX from contract to deployer
        (match (as-contract (stx-transfer? amount tx-sender DEPLOYER))
            success (ok true)
            error (err ERR_TRANSFER_FAILED)
        )
    )
)

;; ----------------------
;; READ-ONLY FUNCTIONS
;; ----------------------

(define-read-only (get-contract-balance)
    (stx-get-balance (as-contract tx-sender))
)

(define-read-only (get-next-deposit-id)
    (var-get next-deposit-id)
)

(define-read-only (get-deposit (player principal) (deposit-id uint))
    (map-get? deposits {player: player, deposit-id: deposit-id})
)

(define-read-only (has-claimed-deposit (player principal) (deposit-id uint))
    (default-to false (get claimed (map-get? claimed-deposits {player: player, deposit-id: deposit-id})))
)

(define-read-only (is-deposit-valid (player principal) (deposit-id uint))
    (match (map-get? deposits {player: player, deposit-id: deposit-id})
        deposit-data (get valid deposit-data)
        false
    )
)

(define-read-only (has-lost-deposit (player principal) (deposit-id uint))
    (default-to false (get lost (map-get? lost-deposits {player: player, deposit-id: deposit-id})))
)
