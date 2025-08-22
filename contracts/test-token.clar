;; SIP-010 Compliant Test Token for Pool Testing
;; This implements the full SIP-010 standard for fungible tokens

(define-fungible-token test-token)

;; Token constants
(define-constant TOKEN_NAME "Test Token")
(define-constant TOKEN_SYMBOL "TEST")
(define-constant TOKEN_DECIMALS u6)
(define-constant TOKEN_URI "https://example.com/test-token")

;; Error constants
(define-constant ERR_UNAUTHORIZED u1)
(define-constant ERR_NOT_TOKEN_OWNER u2)
(define-constant ERR_INSUFFICIENT_BALANCE u3)
(define-constant ERR_INVALID_AMOUNT u4)

;; Contract owner
(define-constant CONTRACT_OWNER tx-sender)

;; SIP-010 Standard Functions

;; Transfer function
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
    (begin
        (asserts! (is-eq tx-sender sender) (err ERR_UNAUTHORIZED))
        (asserts! (> amount u0) (err ERR_INVALID_AMOUNT))
        (ft-transfer? test-token amount sender recipient)
    )
)

;; Get balance
(define-read-only (get-balance (account principal))
    (ok (ft-get-balance test-token account))
)

;; Get total supply
(define-read-only (get-total-supply)
    (ok (ft-get-supply test-token))
)

;; Get token name
(define-read-only (get-name)
    (ok TOKEN_NAME)
)

;; Get token symbol
(define-read-only (get-symbol)
    (ok TOKEN_SYMBOL)
)

;; Get token decimals
(define-read-only (get-decimals)
    (ok TOKEN_DECIMALS)
)

;; Get token URI
(define-read-only (get-token-uri)
    (ok (some "https://example.com/test-token"))
)

;; Admin functions

;; Mint tokens (only contract owner)
(define-public (mint (amount uint) (recipient principal))
    (begin
        (asserts! (is-eq tx-sender CONTRACT_OWNER) (err ERR_UNAUTHORIZED))
        (asserts! (> amount u0) (err ERR_INVALID_AMOUNT))
        (ft-mint? test-token amount recipient)
    )
)

;; Mint initial supply to deployer for testing
(define-public (mint-initial-supply)
    (begin
        (asserts! (is-eq tx-sender CONTRACT_OWNER) (err ERR_UNAUTHORIZED))
        ;; Mint 100,000,000 tokens (100M with 6 decimals)
        (ft-mint? test-token u100000000000000 CONTRACT_OWNER)
    )
)