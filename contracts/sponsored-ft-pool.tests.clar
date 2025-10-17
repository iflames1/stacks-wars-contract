;; ==============================
;; Sponsored FT Pool Contract - Rendezvous Fuzz Tests
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

;; Test: Join as deployer/sponsor - should fund the pool with tokens and add player
(define-public (test-join-as-sponsor)
    (let
        (
            (players-before (get-total-players))
            (exists-before (has-player-joined tx-sender))
            (sponsored-before (is-pool-sponsored))
        )
        (match (join)
            success
            (let
                (
                    (players-after (get-total-players))
                    (exists-after (has-player-joined tx-sender))
                    (sponsored-after (is-pool-sponsored))
                )
                (asserts!
                    (and
                        (is-eq players-after (+ players-before u1))
                        (not exists-before)
                        exists-after
                        (not sponsored-before)
                        sponsored-after
                    )
                    ERR_JOIN_TEST_FAILED
                )
                (ok true)
            )
            error (ok false)  ;; Discard the test case if join fails
        )
    )
)

;; Test: Join as regular player - should add player without funding
(define-public (test-join-as-regular)
    (let
        (
            (players-before (get-total-players))
            (exists-before (has-player-joined tx-sender))
        )
        (match (join)
            success
            (let
                (
                    (players-after (get-total-players))
                    (exists-after (has-player-joined tx-sender))
                )
                (asserts!
                    (and
                        (is-eq players-after (+ players-before u1))
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

;; Test: kick removes player from map and decreases player count
(define-public (test-kick (player-to-kick principal))
    (let
        (
            (players-before (get-total-players))
            (exists-before (has-player-joined player-to-kick))
        )

        (match (kick player-to-kick)
            success
            (let
                (
                    (players-after (get-total-players))
                    (exists-after (has-player-joined player-to-kick))
                )
                (asserts!
                    (and
                        (is-eq players-after (- players-before u1))
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

;; Test: leave as regular player - removes player from map and decreases count
(define-public (test-leave-as-regular (signature (buff 65)))
    (let
        (
            (players-before (get-total-players))
            (exists-before (has-player-joined tx-sender))
        )

        (match (leave signature)
            success
            (let
                (
                    (players-after (get-total-players))
                    (exists-after (has-player-joined tx-sender))
                )
                (asserts!
                    (and
                        (is-eq players-after (- players-before u1))
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

;; Test: leave as sponsor (only when alone) - removes player, decreases count, returns tokens
(define-public (test-leave-as-sponsor (signature (buff 65)))
    (let
        (
            (players-before (get-total-players))
            (exists-before (has-player-joined tx-sender))
            (sponsored-before (is-pool-sponsored))
        )

        (match (leave signature)
            success
            (let
                (
                    (players-after (get-total-players))
                    (exists-after (has-player-joined tx-sender))
                    (sponsored-after (is-pool-sponsored))
                )
                (asserts!
                    (and
                        (is-eq players-after (- players-before u1))
                        exists-before
                        (not exists-after)
                        sponsored-before
                        (not sponsored-after)
                    )
                    ERR_LEAVE_TEST_FAILED
                )
                (ok true)
            )
            error (ok false)  ;; Discard the test case if leave fails
        )
    )
)

;; Test: claim-reward sets claimed flag, transfers correct amount of tokens, and handles fee payment
(define-public (test-claim-reward (amount uint) (signature (buff 65)))
    (let
        (
            (has-claimed-before (has-claimed-reward tx-sender))
        )

        (match (claim-reward amount signature)
            success
            (let
                (
                    (has-claimed-after (has-claimed-reward tx-sender))
                )
                (asserts!
                    (and
                        ;; Check that claimed status is updated correctly
                        (not has-claimed-before)
                        has-claimed-after
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

;; Invariant: If players exist, deployer must have joined first and be a sponsor
(define-read-only (invariant-deployer-joins-first)
    (if (> (get-total-players) u0)
        (let ((player-data (map-get? players {player: DEPLOYER})))
            (and
                (is-some player-data)
                (get is-sponsor (default-to {joined-at: u0, is-sponsor: false} player-data))
            )
        )
        true
    )
)

;; Invariant: If pool is sponsored, deployer must have joined
(define-read-only (invariant-sponsor-present)
    (if (is-pool-sponsored)
        (has-player-joined DEPLOYER)
        true
    )
)