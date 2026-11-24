# REST API

Routes use the `/api` prefix. Send JSON unless uploading a file or forwarding a signed webhook. Protected routes use the session cookie. Validation errors use 4xx responses and permission errors use 401 or 403 as appropriate.

| Area | Main routes |
| --- | --- |
| Health | `GET /health` |
| Authentication | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/forgot`, `POST /auth/reset` |
| Profile and favorites | `PATCH /users/me`, `GET /users/favorites`, `POST /users/favorites/:id`, `DELETE /users/favorites/:id` |
| Public catalog | `GET /stations`, `GET /stations/:id`, `GET /stations/:id/slots?date=YYYY-MM-DD` |
| Reservations | `GET /bookings`, `POST /bookings`, `POST /bookings/:id/cancel`, `PATCH /bookings/:id/session` |
| Host listings | `GET /hosts/overview`, `GET /hosts/stations`, `POST /hosts/stations`, `PATCH /hosts/stations/:id`, `POST /hosts/stations/:id/submit`, `POST /hosts/stations/:id/blocks`, `DELETE /hosts/stations/:id/blocks/:blockId` |
| Payments | `GET /payments/:bookingId`, `POST /payments/:bookingId/order`, `POST /payments/:bookingId/verify`, `POST /payments/:bookingId/demo` |
| Payment review | `GET /admin/payment-reviews`, `PUT /admin/payment-reviews/:bookingId` |
| Reviews | `POST /reviews`, `POST /reviews/:id/report` |
| Administrator | `GET /admin/overview`, `GET /admin/users`, `GET /admin/stations`, `PATCH /admin/stations/:id`, `GET /admin/bookings`, `GET /admin/issues`, `PATCH /admin/reviews/:id` |
| Notifications | `GET /notifications`, `PATCH /notifications/read-all`, `PATCH /notifications/:id/read` |
| Support | `POST /support`, `GET /admin/support`, `PATCH /admin/support/:id` |
| Station images | `POST /uploads` with a raw JPEG, PNG, or WebP body |

`GET /stations` accepts `q`, `connector`, `maxPrice` (INR), `minPower` (kW), `available`, `sort`, `lat` and `lng`. Distances are returned when valid coordinates are supplied. Slot dates refer to the station's local calendar.

Create a reservation with `{ "stationId": "...", "start": "<ISO timestamp>", "end": "<ISO timestamp>", "energyWh": 5000 }`. Use a slot returned by the availability endpoint. The server snapshots price and fees, and returns 409 if another active reservation occupies the slot. The server records payment through the payment routes, and uses the signed webhook when test checkout is configured.

A host creates and submits their own station for admin review. A station decision accepts `APPROVED`, `REJECTED` or `SUSPENDED` and an optional reason when applicable. Only public, approved listings are bookable. Owners can review a completed reservation once.


An administrator can query payment reviews with `status=OPEN` or `status=REVIEWED`, plus `limit` and `offset`. The review endpoint accepts a `note` of 8 to 500 characters and returns `reviewedAt`. Repeating the same decision is idempotent. Booking responses carry `paymentVariance` when the recorded payment and final charge differ or when an inactive reservation received a payment. Review notes are administrator-only.
