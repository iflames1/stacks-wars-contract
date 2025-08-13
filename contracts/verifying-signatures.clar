(define-constant ENTRY_FEE u1000000) ;; 1 STX
(define-constant CONTRACT (as-contract tx-sender))
(define-constant TRUSTED_PUBLIC_KEY 0x0390a5cac7c33fda49f70bc1b0866fa0ba7a9440d9de647fecb8132ceb76a94dfa)

(define-data-var total-players uint u0)

;; Errors
(define-constant ERR_UNAUTHORIZED u100)
(define-constant ERR_SERIALIZATION u103)
(define-constant ERR_INSUFFICIENT_FUNDS u104)

;; Construct message hash from the reward amount and tx-sender
(define-private (construct-message-hash (amount uint))
	(let ((message {
		amount: amount,
		winner: tx-sender,
		contract: (as-contract tx-sender)
		}))
		(match (to-consensus-buff? message)
		buff (ok (sha256 buff))
		(err ERR_SERIALIZATION)
		)
	)
)

;; Join the pool by transferring the entry fee to the contract
(define-public (join-pool)
	(begin
		(try! (stx-transfer? ENTRY_FEE tx-sender (as-contract tx-sender)))
		(var-set total-players (+ (var-get total-players) u1))
		(ok true)
	)
)

;; Leave the pool and refund the entry fee
(define-public (leave-pool)
	(begin
		(asserts! (>= (stx-get-balance (as-contract tx-sender)) ENTRY_FEE) (err ERR_INSUFFICIENT_FUNDS))
		(var-set total-players (- (var-get total-players) u1))
		(try! (stx-transfer? ENTRY_FEE (as-contract tx-sender) tx-sender))
		(ok true)
	)
)

;; Withdraw reward if a valid signature is provided
(define-public (withdraw (amount uint) (signature (buff 65)))
	(begin
		(let (
			(msg-hash (try! (construct-message-hash amount)))
			(recipient tx-sender)
		)
		(asserts! (secp256k1-verify msg-hash signature TRUSTED_PUBLIC_KEY) (err ERR_UNAUTHORIZED))
		(try! (as-contract (stx-transfer? amount tx-sender recipient)))
		(ok true)
		)
	)
)
