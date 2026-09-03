# My Tickets Architecture

`/events/my-tickets` is the public ticket portal for Events.

Related docs:

- [Architecture](./architecture.md)
- [Ticket Instances](./ticket-instances.md)
- [QR System](./qr-system.md)
- [Security](./security.md)
- [API Reference](./api-reference.md)

## Route Behavior

The current user-facing entry point is:

- `/events/my-tickets`

The legacy route:

- `/my-tickets`

is a redirect-only compatibility path that forwards to `/events/my-tickets` and preserves query parameters.

## Two Access Modes

The portal has two modes:

1. account tickets
2. guest order lookup

### Account tickets

If the user is signed in, the portal loads tickets tied to the account email and displays them automatically.

### Guest order lookup

If the user is not signed in, or if they purchased as a guest, they can look up a ticket order by entering:

- order ID or QR code
- buyer email

## Frontend Flow

`app/events/my-tickets/page.tsx` does the following:

1. checks whether there is a signed-in user
2. looks for optional `orderId`, `qr`, and `email` query parameters
3. loads account tickets when a user session exists
4. switches to guest lookup mode when a guest lookup is requested
5. fetches ticket data from `app/api/my-tickets/route.ts`

## Backend Flow

`app/api/my-tickets/route.ts` is the actual data source.

### Guest lookup

Guest lookup requires:

- `orderId` or QR code
- buyer email

It is rate limited to reduce enumeration risk.

The route accepts either:

- a UUID order ID
- a QR code string

It then filters by the buyer email before returning matches.

### Signed-in lookup

Signed-in users can load all orders tied to their account email.

If an `email` query parameter is supplied, it must match the signed-in user email.

That prevents one signed-in user from querying another email address.

## Returned Data

The API returns orders plus hydrated ticket tier data.

Each order includes:

- order details
- event details
- seat label, if any
- quantity
- total amount
- ticket tier summary

The portal then renders one ticket row per order.

## Security Boundary

The portal itself is public, but the lookup rules are not public-ended:

- account mode requires a valid session
- guest mode requires buyer email plus order identifier
- guest mode is rate limited
- the server route runs the actual lookup through a privileged server client

## Important Code Locations

| File | Why it matters |
| --- | --- |
| `app/events/my-tickets/page.tsx` | Public ticket portal UI. |
| `app/my-tickets/page.tsx` | Legacy redirect to the new route. |
| `app/api/my-tickets/route.ts` | Ticket lookup and security rules. |
| `lib/rate-limit.ts` | Guest lookup rate limiting budget. |

## Relevant Tests

- `scratch/test_phase2_relocation_and_security.mjs`

