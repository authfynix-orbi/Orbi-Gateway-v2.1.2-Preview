# Orbi-Gateway-v2.1.1-Stable-Preview

The ORBI Gateway System is an event-driven backend and admin portal for routing SMS and notification workloads through paired Android gateway devices, while also supporting WhatsApp, Email, and Push workflows.

## Core Flow

1. Express receives API or dashboard requests.
2. Templates and ownership data are resolved from Firestore.
3. Messages are written into `message_logs`.
4. Connected Android devices receive outbound jobs over WebSocket.
5. Delivery status, inbox-forwarded SMS, and device telemetry flow back into Firestore and the admin portal.

## Main Features

- QR-based device pairing with ownership binding
- Live device heartbeat, reconnect, and wake-up support
- Message management for outbound jobs and forwarded inbox traffic
- Admin activity tracking and queue visibility
- Template-driven notification dispatch
- Inbound SMS forwarding back into the admin message portal

## Local Run

```bash
npm install
npm run dev
```

## Firestore Indexes

This repo includes composite index definitions in `firestore.indexes.json`.

Deploy them with:

```bash
firebase deploy --only firestore:indexes
```
