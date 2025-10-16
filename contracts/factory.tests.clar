;; ==============================
;; Factory Contract - Rendezvous Fuzz Tests
;; ==============================

;; ----------------------
;; CONSTANTS
;; ----------------------

(define-constant ERR_ASSERTION_FAILED (err u403))

;; ----------------------
;; PROPERTY TESTS
;; ----------------------

;; Test: Join increases total players
(define-public (test-join-increases-players)
    (let
        (
            (players-before (get-total-players))
        )
        (match (join)
            success
            (let
                (
                    (players-after (get-total-players))
                )
                (asserts!
                    (is-eq players-after (+ players-before u1))
                    ERR_ASSERTION_FAILED
                )
                (ok true)
            )
            error (ok false)  ;; Discard the test case if join fails
        )
    )
)

;; Test: Pool balance increases by ENTRY_FEE after join
(define-public (test-join-increases-balance)
    (let
        (
            (balance-before (get-pool-balance))
        )
        (match (join)
            success
            (let
                (
                    (balance-after (get-pool-balance))
                )
                (asserts!
                    (is-eq balance-after (+ balance-before ENTRY_FEE))
                    ERR_ASSERTION_FAILED
                )
                (ok true)
            )
            error (ok false)  ;; Discard the test case if join fails
        )
    )
)

;; ----------------------
;; DISCARD FUNCTIONS
;; ----------------------

;; Discard test for join-increases-players - only allow if player hasn't joined yet
(define-read-only (can-test-join-increases-players)
    (not (has-player-joined tx-sender))
)

;; Discard test for join-increases-balance - only allow if player hasn't joined yet
(define-read-only (can-test-join-increases-balance)
    (not (has-player-joined tx-sender))
)

;; ----------------------
;; INVARIANTS
;; ----------------------

;; Invariant: Pool balance should be reasonable (players * ENTRY_FEE)
(define-read-only (invariant-pool-balance-matches-players)
    (let
        (
            (players-count (get-total-players))
            (pool-balance (get-pool-balance))
        )
        (if (is-eq players-count u0)
            true
            (is-eq pool-balance (* players-count ENTRY_FEE))
        )
    )
)

;; Invariant: If players exist, deployer must have joined first
(define-read-only (invariant-deployer-joins-first)
    (if (> (get-total-players) u0)
        (has-player-joined DEPLOYER)
        true
    )
)

