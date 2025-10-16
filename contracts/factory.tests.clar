;; ==============================
;; Factory Contract - Rendezvous Fuzz Tests
;; ==============================

;; ----------------------
;; CONSTANTS
;; ----------------------

(define-constant ERR_ASSERTION_FAILED (err u403))
(define-constant ERR_KICK_TEST_FAILED (err u201))

;; ----------------------
;; PROPERTY TESTS
;; ----------------------

;; Test: Join increases total players, pool balance, and adds player to map
(define-public (test-join)
    (let
        (
            (players-before (get-total-players))
            (exists-before (has-player-joined tx-sender))
            (balance-before (get-pool-balance))
        )
        (match (join)
            success
            (let
                (
                    (players-after (get-total-players))
                    (exists-after (has-player-joined tx-sender))
                    (balance-after (get-pool-balance))
                )
                (asserts!
                    (and
                        (is-eq players-after (+ players-before u1))
                        (is-eq balance-after (+ balance-before ENTRY_FEE))
                        (not exists-before)
                        exists-after
                    )
                    ERR_ASSERTION_FAILED
                )
                (ok true)
            )
            error (ok false)  ;; Discard the test case if join fails
        )
    )
)

;; Test: kick removes player from map, decreases players count, and deducts ENTRY_FEE from pool balance
(define-public (test-kick (player-to-kick principal))
    (let
        (
            (players-before (get-total-players))
            (exists-before (has-player-joined player-to-kick))
            (balance-before (get-pool-balance))
        )

        (match (kick player-to-kick)
            success
            (let
                (
                    (players-after (get-total-players))
                    (exists-after (has-player-joined player-to-kick))
                    (balance-after (get-pool-balance))
                )
                (asserts!
                    (and
                        (is-eq players-after (- players-before u1))
                        (is-eq balance-after (- balance-before ENTRY_FEE))
                        exists-before
                        (not exists-after)
                    )
                    ERR_KICK_TEST_FAILED
                )
                (ok true)
            )
            error (ok false)  ;; Discard the test case if kick fails
        )
    )
)

;; ----------------------
;; DISCARD FUNCTIONS
;; ----------------------


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

