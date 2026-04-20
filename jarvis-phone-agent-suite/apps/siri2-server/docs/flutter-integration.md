# Siri2 API Integration Guide for Flutter

## Overview

Siri2 is an AI agent running on a rooted Android phone (Moto G 5G 2023, Android 13) via Termux + Node.js. It can control the phone's UI, react to notifications, and run tasks on a cron schedule. The backend exposes a REST API over HTTP that the Flutter app will consume.

**Base URL:** `http://<phone-ip>:3000` (default port 3000, configurable via `PORT` env var)

**Protocol:** All endpoints use JSON. Set `Content-Type: application/json` for request bodies.

**No authentication** — the API runs on the local network.

### Server Discovery

The Flutter app should **automatically discover** the Siri2 server on the local network — no manual IP entry required. On launch (and when reconnecting), the app should:

1. Get the device's local IP and derive the /24 subnet (e.g. `192.168.1.x`)
2. Send `GET /health` to every IP on the subnet on port 3000 with a short timeout (~500ms per request). Run these concurrently (batch of 20-50 at a time) so the full scan completes in a few seconds.
3. Look for a response containing `"agent": "siri2"` — this confirms it's the right server and not some other service on port 3000.
4. Cache the discovered IP (SharedPreferences) so subsequent launches try it first before rescanning.
5. If the cached IP stops responding, rescan automatically.

If no server is found, show a "Searching for Siri2..." state with a retry button. Optionally allow manual IP entry as a fallback in a settings screen, but it should never be the primary flow.

---

## Architecture Concepts

### Device Lock

The phone has a single screen, so only one agent can control it at a time. A **device lock** mediates access:

- **Owner types** (priority highest → lowest): `"user"` > `"notification-agent"` = `"scheduled-task"`
- A `"user"` command (sent from the Flutter app via `/command`) always preempts background agents
- The lock auto-releases after **2 minutes** of inactivity
- If a command is sent while a background task holds the lock, the user command takes over immediately

### Notification Watcher

Polls Android notifications every 5 seconds. Only processes notifications from **whitelisted packages**. Each notification is triaged by an AI agent that decides to ignore, log, or act on it.

### Scheduler

Runs a 60-second interval loop. Tasks have 5-field cron expressions. When a task fires, the system wakes the phone (if screen is off), unlocks with PIN, runs the agent prompt, then puts the phone back to sleep.

---

## API Reference

### Health

#### `GET /health`

Check if the server is running.

**Response:**
```json
{
  "status": "ok",
  "agent": "siri2",
  "uptime": 1234.567
}
```

---

### Commands

#### `POST /command`

Send a natural-language command to the AI agent. The agent will control the phone to fulfill the request. This acquires the device lock as `"user"` priority (preempts any background agent).

**Important:** This is a long-running request. The agent may take 10 seconds to several minutes depending on the task. The Flutter app should show a loading/progress state and use a generous HTTP timeout (at least 5 minutes).

**Request:**
```json
{
  "prompt": "Open Chrome and search for the weather"
}
```

**Response (success):**
```json
{
  "result": "I opened Chrome and searched for the weather. It's currently 72°F and sunny in your area.",
  "turns": 8
}
```

`turns` = number of agent reasoning/tool-call cycles used.

**Response (error):**
```json
{
  "error": "API error: rate limited"
}
```

**Status codes:** `200` success, `400` missing prompt, `500` agent error.

---

### Device Lock

#### `GET /lock/status`

Get current lock state. Useful for showing whether the agent is busy.

**Response (unlocked):**
```json
{
  "locked": false,
  "owner": null,
  "ownerType": null,
  "acquiredAt": null
}
```

**Response (locked):**
```json
{
  "locked": true,
  "owner": "command-1772250000000",
  "ownerType": "user",
  "acquiredAt": 1772250000000
}
```

`ownerType` is one of: `"user"`, `"notification-agent"`, `"scheduled-task"`.

`acquiredAt` is a Unix timestamp (milliseconds).

#### `POST /lock/release`

Force-release the lock. Use as an emergency "stop" button if the agent is stuck.

**Response:**
```json
{
  "ok": true,
  "message": "Lock released"
}
```

---

### Notification Watcher

#### `POST /notifications/start`

Start polling for notifications (5-second interval). Only whitelisted packages trigger the AI triage agent.

**Response:**
```json
{
  "ok": true,
  "message": "Notification watcher started"
}
```

#### `POST /notifications/stop`

Stop polling. Clears the pending queue.

**Response:**
```json
{
  "ok": true,
  "message": "Notification watcher stopped"
}
```

#### `GET /notifications/status`

**Response:**
```json
{
  "running": true,
  "queueLength": 0,
  "filterCount": 3
}
```

| Field | Description |
|-------|-------------|
| `running` | Whether the watcher is polling |
| `queueLength` | Notifications waiting to be triaged |
| `filterCount` | Number of whitelisted packages |

#### `GET /notifications/log`

Get the triage log (last 100 entries). Each entry shows what the AI decided to do with a notification.

**Response:**
```json
{
  "log": [
    {
      "timestamp": 1772250000000,
      "packageName": "com.google.android.gm",
      "title": "New email from Alice",
      "action": "act",
      "reason": "This is an important email that requires a response..."
    }
  ]
}
```

| `action` value | Meaning |
|----------------|---------|
| `"ignore"` | AI decided this notification is not important |
| `"log"` | AI logged it but took no device action |
| `"act"` | AI opened the app and interacted with it |
| `"skip"` | Skipped due to system reasons (device busy, too old) |
| `"error"` | Triage failed |

---

### Notification Filter (Whitelist)

Controls which app packages can trigger the notification agent.

#### `GET /filter/whitelist`

**Response:**
```json
{
  "packages": [
    "com.google.android.gm",
    "com.whatsapp",
    "com.slack"
  ]
}
```

#### `PUT /filter/whitelist`

Replace the entire whitelist. Use for bulk editing.

**Request:**
```json
{
  "packages": ["com.google.android.gm", "com.whatsapp"]
}
```

**Response:**
```json
{
  "ok": true,
  "packages": ["com.google.android.gm", "com.whatsapp"]
}
```

#### `POST /filter/whitelist/add`

Add a single package.

**Request:**
```json
{
  "package": "com.slack"
}
```

**Response:**
```json
{
  "ok": true,
  "packages": ["com.google.android.gm", "com.whatsapp", "com.slack"]
}
```

#### `POST /filter/whitelist/remove`

Remove a single package.

**Request:**
```json
{
  "package": "com.slack"
}
```

**Response:**
```json
{
  "ok": true,
  "packages": ["com.google.android.gm", "com.whatsapp"]
}
```

---

### Scheduler (Cron Jobs)

#### `GET /scheduler/status`

Quick overview of the scheduler.

**Response:**
```json
{
  "running": true,
  "taskCount": 3
}
```

#### `POST /scheduler/start`

Start the 60-second check loop. Tasks loaded from disk are not auto-started on server boot — this must be called.

**Response:**
```json
{
  "ok": true,
  "message": "Scheduler started"
}
```

#### `POST /scheduler/stop`

Stop the check loop. Existing tasks are preserved on disk.

**Response:**
```json
{
  "ok": true,
  "message": "Scheduler stopped"
}
```

#### `GET /scheduler/tasks`

List all scheduled tasks.

**Response:**
```json
{
  "tasks": [
    {
      "id": "sched-1772250974501",
      "name": "Check LinkedIn top posts",
      "prompt": "Open LinkedIn, scroll through the first 2-3 posts...",
      "cronExpression": "0 9 * * *",
      "enabled": true,
      "createdAt": "2026-02-28T03:56:14.501Z",
      "lastRunAt": "2026-02-28T09:00:05.123Z",
      "lastResult": "I opened LinkedIn and found 3 posts..."
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique ID (format: `sched-<timestamp>`) |
| `name` | string | Human-readable name |
| `prompt` | string | Full prompt sent to agent |
| `cronExpression` | string | 5-field cron (min hour dom month dow) |
| `enabled` | boolean | Whether the task fires on schedule |
| `createdAt` | ISO 8601 string | When the task was created |
| `lastRunAt` | ISO 8601 string or null | Last execution time |
| `lastResult` | string or null | Last execution result (truncated to 500 chars) |

#### `POST /scheduler/tasks`

Create a new scheduled task.

**Request:**
```json
{
  "name": "Check Marketplace for apartments",
  "prompt": "Open Facebook Marketplace, search for apartments under $1500 in Salt Lake City, and list any new ones you find.",
  "cronExpression": "0 1 * * *"
}
```

**Cron expression format:** 5 fields separated by spaces:

```
┌───────── minute (0-59)
│ ┌─────── hour (0-23)
│ │ ┌───── day of month (1-31)
│ │ │ ┌─── month (1-12)
│ │ │ │ ┌─ day of week (0-6, 0=Sunday)
│ │ │ │ │
* * * * *
```

Supported syntax per field:
- `*` — every value
- `5` — specific value
- `1,15,30` — comma-separated list
- `*/5` — step (every 5th)

Examples:
| Expression | Meaning |
|------------|---------|
| `0 9 * * *` | Every day at 9:00 AM |
| `0 1 * * *` | Every day at 1:00 AM |
| `30 8 * * 1,3,5` | Mon/Wed/Fri at 8:30 AM |
| `*/15 * * * *` | Every 15 minutes |
| `0 */2 * * *` | Every 2 hours on the hour |

**Response:**
```json
{
  "ok": true,
  "task": {
    "id": "sched-1772251000000",
    "name": "Check Marketplace for apartments",
    "prompt": "Open Facebook Marketplace...",
    "cronExpression": "0 1 * * *",
    "enabled": true,
    "createdAt": 1772251000000,
    "lastRunAt": null,
    "lastResult": null
  }
}
```

**Status codes:** `200` success, `400` missing fields.

#### `DELETE /scheduler/tasks/:id`

Remove a task permanently.

**Response:**
```json
{
  "ok": true,
  "message": "Removed"
}
```

If not found: `{ "ok": false, "message": "Not found" }`

#### `POST /scheduler/tasks/:id/toggle`

Enable or disable a task without removing it.

**Request:**
```json
{
  "enabled": false
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Task disabled"
}
```

#### `POST /scheduler/tasks/:id/run`

Manually trigger a task immediately (for testing). This goes through the full flow: wake device, acquire lock, run agent, sleep device.

**Important:** This is a long-running request like `/command`. Use a generous timeout.

**Response:**
```json
{
  "ok": true,
  "entry": {
    "timestamp": 1772251000000,
    "taskId": "sched-1772250974501",
    "taskName": "Check LinkedIn top posts",
    "success": true,
    "result": "I opened LinkedIn and found...",
    "turns": 19
  }
}
```

If the task was skipped (device busy, unlock failed):
```json
{
  "ok": false,
  "entry": {
    "timestamp": 1772251000000,
    "taskId": "sched-1772250974501",
    "taskName": "Check LinkedIn top posts",
    "success": false,
    "result": "Skipped: device busy (locked by user)",
    "turns": 0
  }
}
```

#### `GET /scheduler/log`

Execution history (last 100 runs across all tasks).

**Response:**
```json
{
  "log": [
    {
      "timestamp": 1772251170832,
      "taskId": "sched-1772250974501",
      "taskName": "Check LinkedIn top posts",
      "success": true,
      "result": "I opened LinkedIn and found 3 posts...",
      "turns": 19
    }
  ]
}
```

---

## Suggested Flutter App Structure

### Screens

1. **Home / Command Screen**
   - Text input for natural language commands
   - Send button → `POST /command`
   - Show agent response in a chat-like view (user message + agent response)
   - Loading indicator while agent is working (can take minutes)
   - Lock status indicator (poll `GET /lock/status` every 2-3 seconds while a command is running)
   - Emergency stop button → `POST /lock/release`

2. **Notification Log Screen**
   - Toggle switch: start/stop → `POST /notifications/start` or `/stop`
   - Status badge: running, queue length → `GET /notifications/status`
   - Triage log list → `GET /notifications/log` (pull-to-refresh)
   - Each log entry shows: time, app icon/name, title, action badge (ignore/log/act/skip/error), reason

3. **Notification Filter Screen**
   - List of whitelisted packages → `GET /filter/whitelist`
   - Add package: text input + add button → `POST /filter/whitelist/add`
   - Remove package: swipe-to-delete → `POST /filter/whitelist/remove`
   - Consider showing common app names alongside package names for readability

4. **Scheduler Screen**
   - Scheduler toggle: start/stop the loop → `POST /scheduler/start` or `/stop`
   - Status header: running state + task count → `GET /scheduler/status`
   - Task list → `GET /scheduler/tasks`
     - Each task card shows: name, cron expression (human-readable), enabled toggle, last run time, last result preview
     - Enable/disable toggle → `POST /scheduler/tasks/:id/toggle`
     - Swipe-to-delete → `DELETE /scheduler/tasks/:id`
     - Tap to see full details (prompt, full last result)
     - "Run Now" button → `POST /scheduler/tasks/:id/run`
   - "Add Task" FAB/button → form with name, prompt (multiline), cron expression
     - Consider a cron helper UI (dropdowns for "every day at X" / "every N minutes" / custom)
     - Creates via `POST /scheduler/tasks`

5. **Settings Screen**
   - Show currently connected server IP
   - "Rescan Network" button to re-run auto-discovery
   - Manual IP override field (fallback only, collapsed by default)
   - Connection test indicator → `GET /health`

### Polling Strategy

The server has no WebSocket/SSE support. Use polling:

| Data | Poll interval | When |
|------|--------------|------|
| Lock status | 2s | While a command is in flight |
| Notification status | 5s | While on the notification screen |
| Notification log | Manual (pull-to-refresh) | On the log screen |
| Scheduler status | 10s | While on the scheduler screen |
| Scheduler tasks | Manual (pull-to-refresh) + after mutations | On the scheduler screen |
| Scheduler log | Manual (pull-to-refresh) | On the log screen |
| Health | On app launch + every 30s in background | Auto-discovery and connection monitoring |

### Error Handling

- **Connection refused / timeout:** Server is not running or IP changed. Automatically trigger a network rescan. Show "Searching for Siri2..." while scanning.
- **`POST /command` timeout:** The agent is still working. The lock status endpoint can confirm this. Offer to wait or force-release.
- **`400` errors:** Missing or invalid fields. Show validation in the UI before sending.
- **`500` errors:** Agent crashed. Show the error message and offer to retry.

### HTTP Client Notes

- Base URL is auto-discovered (see Server Discovery above) and cached in SharedPreferences
- `POST /command` and `POST /scheduler/tasks/:id/run` need very long timeouts (5+ minutes) since the agent may run many tool cycles
- All other endpoints respond instantly
- All request bodies are `application/json`
- All responses are JSON

---

## Common App Package Names (for notification whitelist UI)

For user-friendly display in the filter screen:

| Package | App Name |
|---------|----------|
| `com.google.android.gm` | Gmail |
| `com.whatsapp` | WhatsApp |
| `com.slack` | Slack |
| `com.discord` | Discord |
| `com.facebook.orca` | Messenger |
| `com.instagram.android` | Instagram |
| `com.twitter.android` | X (Twitter) |
| `com.google.android.apps.messaging` | Google Messages |
| `com.linkedin.android` | LinkedIn |
| `com.facebook.katana` | Facebook |

The agent can also discover installed packages at runtime via the `list_packages` tool, but there's no HTTP endpoint for that currently. A workaround: send `POST /command` with prompt `"List all installed app package names"`.
