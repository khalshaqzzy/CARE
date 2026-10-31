# ADR-0074: Unread badge on the CARE app icon

- Status: Accepted (implemented on a branch, not released)
- Date: 30 October 2026
- Related: ADR-0073 (Web Push on by default), PRD §19

## Context

Web Push shows a banner on the phone, but once the banner is dismissed nothing on the Home Screen tells a member that CARE has unread notifications. The product owner asked for the notification to also appear on the CARE icon on the Home Screen.

Installed web apps can mark their icon only through the Badging API (`navigator.setAppBadge` / `clearAppBadge`). It is available to iOS/iPadOS 16.4+ Home Screen apps (with notification permission) and to installed desktop Chrome/Edge apps, also from the service worker. Chrome on Android does not implement it; Android launchers instead draw their own dot (and on some launchers a count) for apps that have notifications in the tray.

## Decision

- **Count in every push.** The API adds `badgeCount` (the recipient's unread notification total) to each Web Push payload. The count is computed only when the recipient has at least one active device. It carries no Voice content, so Private Voice payloads include it as well; titles and bodies stay redacted as before.
- **Service worker sets the badge.** On `push`, the service worker shows the banner and calls `setAppBadge(badgeCount)` in the same `waitUntil`. A payload without a valid count (older server, malformed data) sets a plain dot; a count of 0 clears it.
- **The open app keeps it in sync.** `AppBadgeSync`, mounted in the signed-in workforce shell, mirrors the existing unread-count query (polled every 5 s) onto the icon, so reading notifications in CARE lowers or clears the badge. When the count reaches 0 it also closes CARE banners still in the tray, which clears the Android launcher dot. Leaving the shell (logout) clears the badge.
- **Graceful degradation.** `updateAppBadge` is a no-op where the Badging API is missing and swallows refusals; badging never blocks showing the notification.

## Alternatives considered

- **Badge only from the service worker.** Rejected: the badge would stay stale after the member reads notifications inside CARE until the next push arrives.
- **Badge only from the app.** Rejected: the icon would not change while CARE is closed, which is exactly when the badge matters.
- **A separate silent push to update the count.** Rejected: subscriptions are `userVisibleOnly`, so every push must show a notification.

## Consequences

- One extra indexed `count` query (`Notification(recipientId, readAt, createdAt)`) per delivered push with active devices.
- iPhone/iPad (Home Screen install) and installed desktop apps show the unread number on the icon. Android shows the launcher's own dot while CARE notifications are in the tray; a numeric count there depends on the launcher.
- Reading everything in CARE clears banners left in the tray.

## Validation

- API unit tests: the payload includes `badgeCount` (also for Private Voices) and no count query runs when the recipient has no device.
- Web unit tests: badge count parsing (non-negative integers only), set/clear/dot behaviour, and no-op/refusal handling.
- Foundation guard test updated to the new push handler shape (still delegating to the shared payload module).
- Playwright `push` project: the open app writes the unread count to the icon badge (16/16 pass). Core Chromium and PWA suites pass.

## Follow-up

- Confirm on a real iPhone Home Screen install that the number appears after a push and clears after reading.
