# ORBI Gateway System - Full Infrastructure Documentation

The ORBI Gateway System is an event-driven, full-stack backend service designed to bridge your ORBI infrastructure with Android devices acting as SMS gateways, alongside WhatsApp, Email, and Push notification channels.

---

## 🏗️ Architecture Overview

The system uses a robust **Event-Driven Architecture (EDA)** backed by persistent queues to decouple the request source from the dispatching services.

1. **API Layer (Express):** Receives HTTP requests (e.g., OTP requests, bulk notifications).
2. **Channel Router (`notificationService`):** Determines the best delivery channel (SMS, WhatsApp, Email, Push) and handles fallbacks.
3. **Queue System (SQLite):** Background jobs are persisted to a local SQLite database (`queue.db`) to ensure zero message loss during restarts.
4. **Worker Processes (`smsWorker`):** Continuously poll the queue, process jobs, and dispatch them to connected devices.
5. **WebSocket Gateway (`deviceSocket`):** Maintains real-time connections with Android devices to execute SMS tasks. Device ownership is established during pairing and cannot be rewritten by later heartbeats.
6. **Database (Firebase Firestore):** Stores message templates, device registries, short-lived pairing codes, API credentials, idempotency indexes, and detailed message logs.
7. **FCM Wake-Up:** High-priority push notifications to wake up devices from doze mode and force reconnection.

---

## 🔌 Template Connections Instructions

The ORBI Gateway uses a dynamic template engine backed by Firebase Firestore. This allows you to update message content without redeploying the server.

### 1. Storing Templates in Firestore
Templates are stored in the `message_templates` collection. Each document must have the following fields:
- `name` (string): The unique identifier for the template (e.g., `otp_verification`, `welcome_message`).
- `channel` (string): The target channel (`sms`, `whatsapp`, `email`, `push`).
- `language` (string): The ISO language code (e.g., `en`, `es`, `fr`).
- `body` (string): The actual message content containing variables.

### 2. Template Variables
Variables in the `body` are wrapped in double curly braces: `{{variableName}}`.
*Example Body:* `Hello {{name}}, your ORBI verification code is {{code}}. Valid for 5 minutes.`

### 3. Using the "Custom" Template
If you don't want to use a pre-defined Firestore template, you can pass `templateName: "custom"` in your API request and provide the raw message in the `data.body` field.

## 📱 Device Pairing & Connection

The ORBI Gateway System uses a modern, QR-based pairing system to link Android devices securely.

### 1. QR Code Pairing (Primary Method)
1. Open the **Gateway Devices** tab in the dashboard.
2. Click **"Link New Device"**.
3. Open the **ORBI Gateway** app on your Android device.
4. Tap **"Scan QR Code"** and scan the code displayed on the dashboard.
5. The dashboard generates a short-lived `pairingCode` tied to the logged-in user.
6. The Android app sends that `pairingCode` to `POST /api/devices/register`.
7. The backend claims the device for the current user, writes it to Firestore, marks the pairing code as used, and only then allows the device to reconnect automatically.

### 2. Connection Persistence
- **Automatic Retry:** If the Android app loses connection, it will automatically attempt to reconnect 3 times at 2-second intervals.
- **Heartbeat:** The app sends status every 30 seconds. The backend tolerates network jitter and only marks the device offline after a longer stale timeout.
- **Manual Wake-up:** If a device is offline in the dashboard, you can click **"Retry Connection"**. This sends a high-priority FCM push to the device, forcing it to wake up and reconnect immediately.

---

## 🛠️ User Manual: Feature Troubleshooting

### 1. SQLite Queue Errors (`SQLITE_ERROR`)
- **Symptom:** `SQLITE_ERROR: no such column` or `database is locked`.
- **Cause:** Syntax errors in SQL queries or concurrent write locks.
- **Fix:** Ensure string literals in SQL queries use single quotes (`'pending'`). If the database is locked, ensure you aren't running multiple conflicting Node.js processes accessing `queue.db` simultaneously.

### 2. Android Device Not Receiving SMS Jobs
- **Symptom:** API returns success, but the phone does nothing.
- **Check 1 (Ownership):** Ensure the connected device document has the correct `ownerUid`.
- **Check 2 (WebSocket):** Ensure the device is connected and sending heartbeats.
- **Check 3 (API Call):** Ensure the sender includes `x-api-key`, and if using the trusted infrastructure key, also includes `ownerUid`, `ownerEmail`, or `deviceId`.
- **Check 4 (Battery):** Ensure "Battery Optimization" is disabled for the ORBI Gateway app on the phone.

### 3. Connection Drops Frequently
- **Cause:** Android "Doze Mode" or aggressive battery management.
- **Fix:** Disable battery optimization for the app. Use the **"Retry Connection"** button in the dashboard to send an FCM wake-up signal if the device stays offline.

### 3. Firebase Permission Denied (Code 7)
- **Symptom:** `[Template Engine] PERMISSION DENIED. Check Firebase Admin permissions.`
- **Cause:** The server's Firebase Admin SDK service account lacks read/write access to Firestore.
- **Fix:** Verify your `FIREBASE_SERVICE_ACCOUNT` environment variable is correctly formatted JSON and belongs to a project with Firestore enabled.

### 4. Fallback Logic Triggering Unexpectedly
- **Symptom:** Emails are being sent as SMS.
- **Cause:** SendGrid or SMTP credentials are missing/invalid, causing the `routeToEmail` function to fail and trigger the `catch` block which falls back to SMS.
- **Fix:** Check `.env` for `SENDGRID_API_KEY` or `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`.

---

## 🚀 Expansions & Scaling

### 1. Migrating from SQLite to Redis (Enterprise Scale)
The current queue uses SQLite (`better-sqlite3`) for simplicity and zero-config persistence. To scale horizontally across multiple servers:
1. Provision a Redis instance (e.g., Upstash, AWS ElastiCache).
2. Add `REDIS_URL` to your environment variables.
3. Replace `sqliteQueue.ts` imports in `queueService.ts` and `smsWorker.ts` with **BullMQ**.
4. *Note: The codebase previously contained BullMQ logic; you can revert to the BullMQ implementation for instant Redis support.*

### 2. Adding a New Channel (e.g., Telegram / Slack)
1. Create a new service file (e.g., `telegramService.ts`).
2. Open `src/services/notificationService.ts`.
3. Add a new `case "telegram":` in the `ChannelRouter.route()` switch statement.
4. Implement a `routeToTelegram()` private method that calls your new service.
5. Update the `channel` type definitions to include `"telegram"`.

### 3. Adding Custom Webhooks for Delivery Status
Currently, the Android device sends a `STATUS_UPDATE` via WebSocket, which updates Firestore. To notify external systems:
1. Open `src/websocket/deviceSocket.ts`.
2. Locate the `payload.task === "STATUS_UPDATE"` block.
3. Add an HTTP POST request (using `fetch` or `axios`) to forward the status payload to your external webhook URL.

### 4. FCM Wake-Up Trigger
The backend automatically wakes up offline Android devices using Firebase Cloud Messaging (FCM) when a new SMS job is queued but no devices are connected.
- **Android App Requirement:** The app must register for FCM and send its token via the `DEVICE_INFO` WebSocket payload (`{ "task": "DEVICE_INFO", "fcmToken": "..." }`).
- **Backend Behavior:** If the queue has jobs but no active WebSocket connections, the backend sends a high-priority FCM data message (`{ "task": "WAKE_UP", "action": "RECONNECT_WEBSOCKET" }`) to all offline devices to force them to wake up and reconnect.

---

## 📡 API Documentation

External integrations authenticate with `x-api-key`.
- **User API key:** resolves ownership automatically from the key.
- **Trusted infrastructure key (`ORBI_GATEWAY_API_KEY`):** allowed for server-to-server integrations, but the request must still include `ownerUid`, `ownerEmail`, or `deviceId`.

### Send Notification via Template
- **Endpoint:** `POST /api/send-template`
- **Payload:**
  ```json
  {
    "ownerUid": "USER_UID",
    "ownerEmail": "user@example.com",
    "templateName": "otp_verification",
    "data": { "name": "Danny", "code": "482193" },
    "recipient": "+255712345678",
    "channel": "sms",
    "language": "en",
    "messageType": "transactional",
    "requestId": "otp-20260318-0001"
  }
  ```

Notes:
- When using a user API key, `ownerUid` and `ownerEmail` are optional because ownership is derived from the key.
- When using `ORBI_GATEWAY_API_KEY`, the request must include `ownerUid`, `ownerEmail`, or `deviceId`.
- `ownerUid` is the canonical ownership key.
- `ownerEmail` is accepted as a convenience alias and is resolved to the canonical `ownerUid`.
- `requestId` is recommended for idempotency. Duplicate submissions with the same resolved `ownerUid + requestId` return the original message instead of creating a second one.

### Send Raw SMS
- **Endpoint:** `POST /api/messages/send`
- **Payload:**
  ```json
  {
    "ownerUid": "USER_UID",
    "ownerEmail": "user@example.com",
    "recipient": "+255712345678",
    "body": "Hello from ORBI Gateway!",
    "channel": "sms",
    "messageType": "transactional",
    "requestId": "raw-sms-20260318-0001"
  }
  ```

### Pairing Config
- **Endpoint:** `GET /api/pairing-config`
- **Authentication:** Requires Firebase bearer token from the logged-in dashboard user.
- **Behavior:** Returns a WebSocket base URL plus a short-lived `pairingCode` bound to that user. The Android app uses that pairing code during `POST /api/devices/register`.

## 💻 How to Run Locally

1. **Install dependencies:** `npm install`
2. **Environment:** Copy `.env.example` to `.env` and fill in the values.
3. **Run the server:** `npm run dev` (Runs on port 3000).

## 🔎 Firestore Index Requirements

The ownership-aware and idempotent routing logic requires Firestore composite indexes.

Required indexes:
- `message_logs`: `createdBy ASC`, `requestId ASC`
- `message_templates`: `name ASC`, `channel ASC`, `createdBy ASC`, `language ASC`

The repository includes these definitions in:
- `firestore.indexes.json`

Deploy them with Firebase:
```bash
firebase deploy --only firestore:indexes
```
