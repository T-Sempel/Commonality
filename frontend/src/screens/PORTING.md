# Screen Porting Guide

Six screens in this directory are stubs. They each map directly to a component
in the original single-file prototype `commonality.jsx`. Porting each one is a
mechanical exercise — keep all visual markup, theming, and copy identical.

## What changes

### 1. Replace `window.storage` calls with the API client

```ts
// before
const p = await safeGet(`profiles:${session.userId}`);
await safeSet(`profiles:${session.userId}`, data);

// after
import { profile } from "../lib/api";
const p = await profile.get();
await profile.save(data);
```

### 2. Replace polling with realtime in `ChatScreen`

```ts
// before
useEffect(() => {
  const interval = setInterval(loadChat, 2500);
  return () => clearInterval(interval);
}, []);

// after
import { useChat } from "../hooks/useChat";
const { chat, reload } = useChat(activeChatId);
// no interval — Postgres CDC pushes updates via Supabase Realtime
```

### 3. Remove demo-only code

- `simulateReply()` in ChatScreen — gone, real users now reply.
- `seedDemoUsers()` in MatchesScreen — gone, real users come from `/api/matches`.

### 4. Trust the server's response

The frontend can run `detectViolations()` from `@commonality/shared/validation`
for instant UX feedback (red border on the input, etc.) — but the server's
response is authoritative. A 422 with code `harassment` or `pii_blocked` means
the message was rejected, regardless of what the client preview said.

### 5. Errors are typed

`api.ApiError` carries `{ code, message, status }`. Use `e.code` to branch on
specific errors (e.g. `"no_account"` vs `"account_exists"` for auth).

## Mapping table

| Prototype component                                          | New file                          | Primary API methods                                     |
| ------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------- |
| `ProfileScreen`                                              | `screens/ProfileScreen.tsx`       | `profile.get/save`                                      |
| `MatchesScreen`                                              | `screens/MatchesScreen.tsx`       | `matches.list/accept`                                   |
| `ChatScreen` + `ReportModal`                                 | `screens/ChatScreen.tsx`          | `chats.send/ready/leave/save`, `reports.file`, `useChat`|
| `SavedChatsScreen`                                           | `screens/SavedChatsScreen.tsx`    | `chats.list`                                            |
| `SettingsScreen` (and helpers)                               | `screens/SettingsScreen.tsx`      | `me.update/delete`, `blocks.list/remove`, `useSettings` |
| `ModeratorDashboard` + `ReportDetail` + `SuspendedUsersList` | `screens/ModeratorDashboard.tsx`  | `mod.reports/action/suspendedUsers/reinstate`           |

`AuthScreen` and `HomeScreen` are already fully ported.
