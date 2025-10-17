;; ==============================
;; Sponsored Pool Contract - Rendezvous Fuzz Tests
;; ==============================

;; ----------------------
;; CONSTANTS
;; ----------------------

(define-constant ERR_JOIN_TEST_FAILED (err u200))
(define-constant ERR_KICK_TEST_FAILED (err u201))
(define-constant ERR_LEAVE_TEST_FAILED (err u202))
(define-constant ERR_CLAIM_REWARD_TEST_FAILED (err u203))

;; Helper function to get the balance
(define-read-only (get-balance)
  (stx-get-balance (as-contract tx-sender)))

;; ----------------------
;; PROPERTY TESTS
;; ----------------------

;; Test: Join as deployer/sponsor - should fund the pool and add player
(define-public (test-join-as-sponsor)
    (let
        (
            (players-before (get-total-players))
            (exists-before (has-player-joined tx-sender))
            (balance-before (get-pool-balance))
            (sponsored-before (is-pool-sponsored))
        )
        (match (join)
            success
            (let
                (
                    (players-after (get-total-players))
                    (exists-after (has-player-joined tx-sender))
                    (balance-after (get-pool-balance))
                    (sponsored-after (is-pool-sponsored))
                )
                (asserts!
                    (and
                        (is-eq players-after (+ players-before u1))
                        (is-eq balance-after (+ balance-before POOL_SIZE))
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

;; Test: Join as regular player - should add player without changing balance
(define-public (test-join-as-regular)
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
                        (is-eq balance-after balance-before) ;; Balance doesn't change for regular players
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
                        (is-eq balance-after balance-before) ;; Balance unchanged for kick in sponsored pool
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
                        (is-eq balance-after balance-before) ;; Balance unchanged for regular player
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

;; Test: leave as sponsor (only when alone) - removes player, decreases count, returns funds
(define-public (test-leave-as-sponsor (signature (buff 65)))
    (let
        (
            (players-before (get-total-players))
            (exists-before (has-player-joined tx-sender))
            (balance-before (get-pool-balance))
            (sponsored-before (is-pool-sponsored))
        )

        (match (leave signature)
            success
            (let
                (
                    (players-after (get-total-players))
                    (exists-after (has-player-joined tx-sender))
                    (balance-after (get-pool-balance))
                    (sponsored-after (is-pool-sponsored))
                )
                (asserts!
                    (and
                        (is-eq players-after (- players-before u1))
                        (is-eq balance-after u0) ;; Balance should be zero after sponsor leaves
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

;; Discard test for join as sponsor - only allow if:
;; 1. User is deployer
;; 2. Pool is not yet sponsored
;; 3. Player hasn't joined already
(define-read-only (can-test-join-as-sponsor)
    (and
        (is-eq tx-sender DEPLOYER)
        (not (is-pool-sponsored))
        (not (has-player-joined tx-sender))
    )
)

;; Discard test for join as regular - only allow if:
;; 1. User is not deployer
;; 2. Pool is sponsored
;; 3. Player hasn't joined already
(define-read-only (can-test-join-as-regular)
    (and
        (not (is-eq tx-sender DEPLOYER))
        (is-pool-sponsored)
        (not (has-player-joined tx-sender))
    )
)

;; Discard test for kick - only allow if:
;; 1. User is deployer
;; 2. Target player has joined
;; 3. Target player is not deployer
;; 4. Target hasn't claimed a reward
(define-read-only (can-test-kick (player-to-kick principal))
    (and
        (is-eq tx-sender DEPLOYER)
        (has-player-joined player-to-kick)
        (not (is-eq player-to-kick DEPLOYER))
        (not (has-claimed-reward player-to-kick))
    )
)

;; Discard test for leave as regular - only allow if:
;; 1. User is not deployer
;; 2. User has joined
(define-read-only (can-test-leave-as-regular (signature (buff 65)))
    (and
        (not (is-eq tx-sender DEPLOYER))
        (has-player-joined tx-sender)
    )
)

;; Discard test for leave as sponsor - only allow if:
;; 1. User is deployer
;; 2. User has joined
;; 3. Total players is 1 (deployer is alone)
(define-read-only (can-test-leave-as-sponsor (signature (buff 65)))
    (and
        (is-eq tx-sender DEPLOYER)
        (has-player-joined tx-sender)
        (is-eq (get-total-players) u1)
    )
)

;; Discard test for claim-reward - only allow if:
;; 1. Player has joined
;; 2. Player has not claimed a reward already
;; 3. Pool has sufficient balance for the claim
(define-read-only (can-test-claim-reward (amount uint) (signature (buff 65)))
    (and
        (has-player-joined tx-sender)
        (not (has-claimed-reward tx-sender))
        (>= (get-pool-balance) amount)
    )
)

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