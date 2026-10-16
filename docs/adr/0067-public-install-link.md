# ADR-0067: Public Install Link for the Workforce PWA

- Status: Accepted
- Date: 16 October 2026
- Related: ADR-0026 (iOS legacy PWA capability tiers), ADR-0051 (Web Push Android enrollment)

## Context

The workforce application is a Progressive Web App, but employees had no simple way to put it on their home screen. Installation depended on each person finding the browser's own menu entry, which differs between Android browsers and is hidden under the Share sheet on iPhone. A single link that can be shared in chat, email or as a QR code was needed.

Browsers do not allow a web page to install itself from a link. Chromium-based browsers expose a deferred `beforeinstallprompt` event that a page may use to show the native install dialog after a user gesture. Safari on iOS and iPadOS offers no programmatic install at all; the only route is **Bagikan → Tambah ke Layar Utama**, and only from Safari itself. In-app browsers (Instagram, Facebook, LINE and Android WebViews) cannot install web apps.

## Decision

A public route, `/install`, is added to the workforce app outside the session gate. It shows the CARE icon, the name and one short title, followed by exactly one action that depends on the browser:

| Situation                              | Title                 | Action                                                               |
| -------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| Chromium has offered an install prompt | Pasang CARE di HP     | **Instal CARE** opens the native dialog                              |
| iPhone/iPad Safari                     | Pasang CARE di iPhone | Two steps: Bagikan, Tambah ke Layar Utama                            |
| Other iOS browser or in-app browser    | Buka di Safari        | **Salin link** copies the install URL                                |
| Android in-app browser                 | Buka di Chrome        | Link with an Android `intent://` URL that reopens the page in Chrome |
| Other browsers without a prompt        | Pasang CARE di HP     | Two steps: browser menu, Instal aplikasi                             |
| Install accepted (`appinstalled`)      | CARE sudah terpasang  | **Buka CARE**                                                        |

When the page is opened from the installed app (`display-mode: standalone`), it redirects to `/`.

The deferred `beforeinstallprompt` event is captured in `main.tsx` before the application bundle mounts, because Chromium fires it once, early in page load. It is stored in `lib/install-prompt.ts` and replayed to the page through a small subscription.

## Rationale

The page cannot remove the user's confirmation, but it reduces Android to two taps and iPhone to two guided steps from one shareable URL. Capturing the event at boot avoids losing it on a direct visit to `/install`. Keeping the route public lets the link be opened before signing in, and the page needs no API call. Copy is kept to a title and short labels, in line with the minimal-text direction for workforce screens. The centred-icon layout was chosen over a cobalt hero and a store-listing layout during design review.

## Alternatives Considered

- A link that installs without confirmation is not possible in any browser.
- A dismissible install banner inside the app was not chosen because it only reaches people who already found CARE, and adds persistent UI to every screen.
- Detecting the platform on the server was rejected; the client already has the user agent and the install event, and the page stays static.

## Implementation Details

- `apps/web-voice/src/lib/install-prompt.ts`: event capture, `promptInstall`, platform detection (`ios-safari`, `ios-other`, `android`, `android-in-app`, `desktop`) and `chromeIntentUrl`.
- `apps/web-voice/src/features/install/InstallPage.tsx` and the `.install-*` styles (Poppins, centred layout).
- The route is served by the existing SPA fallback in `deploy/nginx/spa.conf`; no deployment change is required.

## Consequences

- Shareable URL: `https://satucare.com/install` on staging.
- Platform detection relies on user-agent patterns. An unrecognised in-app browser falls back to the generic menu steps, which remain correct but less direct.
- Chromium only offers the prompt when its install criteria are met and the app is not already installed; otherwise the menu steps are shown.

## Validation

- Unit tests cover platform detection, including desktop-mode iPad, in-app browsers and the intent URL.
- Mocked Playwright journeys cover the replayed install prompt and `appinstalled`, iPhone Safari, iPhone Chrome and an Android in-app browser. The accessibility and overflow suite includes `/install`.

## Risks and Follow-up

- Real-device checks on Android Chrome, Samsung Internet and iPhone Safari remain manual.
- A printable QR code for the link may be produced separately if needed.
