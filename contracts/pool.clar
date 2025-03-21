;; ==============================
;; Stacks Wars - Pool Contract
;; ==============================
;; This contract allows users to create a game pool with a fixed entry fee.
;; Other players can later join the pool by paying the specified fee.

;; ----------------------
;; DATA STRUCTURES
;; ----------------------

;; Map to store pool details, where:
;; - `pool-id` (uint) is the unique identifier for each pool.
;; - `creator` (principal) is the wallet address of the user who created the pool.
;; - `entry-fee` (uint) is the amount required to join the pool.
;; - `total-players` (uint) tracks the number of players in the pool.
(define-map pools
	uint
	{ creator: principal, entry-fee: uint, total-players: uint }
)

;; A variable to track the next available pool ID.
(define-data-var next-pool-id uint u1)

;; ----------------------
;; PUBLIC FUNCTIONS
;; ----------------------

;; Function to create a new pool.
;; - Accepts an `entry-fee` (fee required to join the pool).
;; - Generates a unique `pool-id` and stores the pool details.
(define-public (create-pool (fee uint))
	(if (> fee u0)
		(let ((pool-id (var-get next-pool-id))) ;; Get the next available pool ID
			(begin
				;; Store the pool details in the map
				(map-set pools pool-id { creator: tx-sender, entry-fee: fee, total-players: u0 })

				;; Increment the pool ID for the next pool
				(var-set next-pool-id (+ pool-id u1))

				;; Return the pool ID to the caller
				(ok pool-id)
			)
		)
		(err u1) ;; Return error if fee is 0
	)
)
