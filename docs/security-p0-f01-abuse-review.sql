-- ============================================================================
-- P0 F-01 abuse review — READ-ONLY operator queries (do not modify data).
-- Run these in the PRODUCTION Supabase SQL editor (service role) to identify
-- orders created while POST /api/checkout trusted client-supplied prices
-- (fixed by server-authoritative pricing in lib/ticket-pricing.ts).
--
-- Background: the legacy route accepted `ticketPrice` from the request body.
-- `ticketPrice = 0` minted a `status = 'valid'` order with no payment, and any
-- underpriced value was charged via Stripe while the tainted metadata total
-- was recorded. Free orders created by the fixed route carry
-- payment_method = 'free' AND a database-verified zero total, so they are
-- excluded below by joining the CURRENT ticket price.
-- ============================================================================

-- 1. Zero-value orders on CURRENTLY-PAID tickets (prime free-mint suspects).
--    Excludes tickets whose database price is genuinely 0 (legitimate free).
SELECT
  o.id            AS order_id,
  o.created_at,
  o.event_id,
  e.title         AS event_title,
  o.ticket_id,
  t.name          AS ticket_name,
  t.price         AS current_db_price,
  o.quantity,
  o.total_amount  AS recorded_total,
  o.buyer_email,
  o.buyer_name,
  o.seat_id,
  o.seat_label,
  o.qr_code,
  o.status,
  o.payment_method,
  o.stripe_session_id
FROM ticket_orders o
JOIN events   e ON e.id = o.event_id
LEFT JOIN tickets t ON t.id = o.ticket_id
WHERE o.total_amount = 0
  AND o.status IN ('valid', 'used')
  AND COALESCE(t.price, 0) > 0
ORDER BY o.created_at DESC;

-- 2. Suspiciously underpriced orders: recorded total below the CURRENT
--    database unit price × quantity (catches 1-cent / reduced-price abuse).
--    NOTE: ticket prices may have changed since purchase, so MANUALLY verify
--    each row (price history / event records) before treating as fraud.
SELECT
  o.id            AS order_id,
  o.created_at,
  o.event_id,
  e.title         AS event_title,
  o.ticket_id,
  t.name          AS ticket_name,
  t.price         AS current_db_price,
  o.quantity,
  o.total_amount  AS recorded_total,
  ROUND((COALESCE(t.price, 0) * o.quantity)::numeric, 2) AS expected_at_current_price,
  o.buyer_email,
  o.status,
  o.payment_method,
  o.stripe_payment_intent_id,
  o.stripe_session_id
FROM ticket_orders o
JOIN events   e ON e.id = o.event_id
JOIN tickets  t ON t.id = o.ticket_id
WHERE o.status IN ('valid', 'used')
  AND COALESCE(t.price, 0) > 0
  AND o.total_amount < ROUND((t.price * o.quantity)::numeric, 2)
ORDER BY o.created_at DESC;

-- 3. Seats marked sold WITHOUT a matching valid order (inventory corruption).
SELECT
  s.id            AS seat_id,
  s.event_id,
  s.section,
  s.row_label,
  s.seat_number,
  s.status,
  s.reserved_until
FROM seats s
WHERE s.status = 'sold'
  AND NOT EXISTS (
    SELECT 1
    FROM ticket_orders o
    WHERE o.seat_id = s.id
      AND o.status IN ('valid', 'used')
  )
ORDER BY s.event_id;

-- 4. Duplicate valid orders sharing one idempotency marker (should be unique
--    per attempt; duplicates indicate a pre-fix double-mint or race).
SELECT
  stripe_session_id,
  COUNT(*) AS order_count,
  array_agg(id) AS order_ids
FROM ticket_orders
WHERE stripe_session_id LIKE 'free:%'
GROUP BY stripe_session_id
HAVING COUNT(*) > 1;

-- 5. Volume check: buyers with abnormal free-order counts (bulk harvesting).
SELECT
  buyer_email,
  COUNT(*) AS free_order_count,
  array_agg(id) AS order_ids
FROM ticket_orders
WHERE total_amount = 0
  AND status IN ('valid', 'used')
GROUP BY buyer_email
HAVING COUNT(*) > 5
ORDER BY free_order_count DESC;
