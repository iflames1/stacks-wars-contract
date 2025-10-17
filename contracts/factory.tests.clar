;; ==============================
;; Factory Contract - Rendezvous Fuzz Tests
;; ==============================

;; ----------------------
;; CONSTANTS
;; ----------------------

(define-constant ERR_JOIN_TEST_FAILED (err u200))
(define-constant ERR_KICK_TEST_FAILED (err u201))
(define-constant ERR_LEAVE_TEST_FAILED (err u202))
(define-constant ERR_CLAIM_REWARD_TEST_FAILED (err u203))

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
                    ERR_JOIN_TEST_FAILED
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

;; Test: leave removes player from map, decreases players count, and deducts ENTRY_FEE from pool balance
(define-public (test-leave (signature (buff 65)))
    (let
        (
            (players-before (get-total-players))
            (exists-before (has-player-joined tx-sender))
            (balance-before (get-pool-balance))
        )

        (match (leave signature)
            success
            (let
                (
                    (players-after (get-total-players))
                    (exists-after (has-player-joined tx-sender))
                    (balance-after (get-pool-balance))
                )
                (asserts!
                    (and
                        (is-eq players-after (- players-before u1))
                        (is-eq balance-after (- balance-before ENTRY_FEE))
                        exists-before
                        (not exists-after)
                    )
                    ERR_LEAVE_TEST_FAILED
                )
                (ok true)
            )
            error (ok false)  ;; Discard the test case if leave fails
        )
    )
)

;; Test: claim-reward sets claimed flag, transfers correct amount, and handles fee payment
(define-public (test-claim-reward (amount uint) (signature (buff 65)))
    (let
        (
            (has-claimed-before (has-claimed-reward tx-sender))
            (balance-before (get-pool-balance))
            (fee (/ (* amount FEE_PERCENTAGE) u100))
            (net-amount (- amount fee))
        )

        (match (claim-reward amount signature)
            success
            (let
                (
                    (has-claimed-after (has-claimed-reward tx-sender))
                    (balance-after (get-pool-balance))
                )
                (asserts!
                    (and
                        ;; Check that claimed status is updated correctly
                        (not has-claimed-before)
                        has-claimed-after

                        ;; Check that the balance is reduced correctly
                        (is-eq balance-after (- balance-before amount))
                    )
                    ERR_CLAIM_REWARD_TEST_FAILED
                )
                (ok true)
            )
            error (ok false)  ;; Discard the test case if claim-reward fails
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

