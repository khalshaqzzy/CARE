# ADR-0077: Camera or gallery choice for photo attachments

- Status: Accepted (implemented on `feat/android-camera-capture`, not released)
- Date: 3 November 2026
- Related: ADR-0021 (member Voice image redesign), ADR-0027 (in-page attachment viewer), PRD §12 (Create Voice attachments) and §25 (file and media storage)

## Context

Photos can be attached in three places in the workforce app: the Create/Edit Voice form (Foto Lampiran), the conversation composer and the closure-evidence step of **Tutup Voice**. All three used one hidden input:

```html
<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden />
```

On Android 13 and earlier, Chrome answered such an input with a chooser that offered both the camera and the file browser. Since Android 14, Chrome routes an input that accepts only images to the system photo picker (`ACTION_PICK_IMAGES`). That picker shows existing photos only and has no camera entry. A reporter on a current Android phone therefore had to leave CARE, take the photo in the Camera app, return and pick it from the gallery. iOS Safari still lists "Take Photo" in its own menu and was not affected.

The restriction was not caused by CARE configuration. `Permissions-Policy: camera=(self)` is already sent for the workforce origin, and a file input hands off to the camera application rather than using `getUserMedia`, so no permission prompt or header is involved.

## Decision

Every photo button shows a small **Tambah foto** sheet on touch devices before any picker opens:

- **Ambil foto** clicks a dedicated hidden input with `capture="environment"`. The browser opens the rear camera directly and returns one photo.
- **Pilih dari galeri** clicks the existing multi-file input, unchanged, so several existing photos can still be chosen at once.

Touch devices are recognised with the `(pointer: coarse)` media query, read at the moment the button is tapped. Mouse-driven devices skip the sheet and open the file dialog directly, as before, because `capture` has no effect there.

Both inputs keep the server's allowlist `image/jpeg,image/png,image/webp`. Camera photos flow into the same handlers as gallery photos, so the five-file limit, the client-side compression from `compressPhoto` and all server checks apply unchanged.

## Rationale

- The `capture` attribute is the only standards-based way for a web page to request the camera through a file input, and it is honoured by Chrome on Android and by Safari on iOS.
- `capture` removes the gallery from the picker, so it cannot replace the existing input; a choice in front of two inputs gives both sources on every platform.
- A single button that opens a choice keeps every screen visually unchanged and matches the menu that Android users already knew. A layout with separate Kamera and Galeri buttons was previewed and declined in favour of the unchanged layout.
- The file-type allowlist and server validation remain the security boundary; no part of it is relaxed.

## Alternatives considered

| Alternative                                                                  | Reason not chosen                                                                                                                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add `text/plain` or the non-standard `android/allowCamera` token to `accept` | Restores the old Android chooser but lets users pick arbitrary file types, weakening the client-side contract; behaviour is undocumented and may change. |
| Add `capture` to the existing input                                          | Removes gallery selection and multi-select on mobile.                                                                                                    |
| Separate always-visible Kamera and Galeri buttons                            | Works, but changes three screens and narrows the chat text field; the unchanged layout was preferred.                                                    |
| In-page camera with `getUserMedia`                                           | Needs a custom viewfinder, permission prompts, orientation and resolution handling, and fails on legacy iOS; far more code for the same result.          |
| Native wrapper (TWA/Capacitor)                                               | Out of scope for the PWA delivery model.                                                                                                                 |

## Implementation details

- `apps/web-voice/src/components/PhotoSource.tsx`
  - `prefersSourceChoice(scope)` evaluates `(pointer: coarse)` and returns `false` when `matchMedia` is missing or throws.
  - `usePhotoSource(galleryRef)` returns `{ open, setOpen, start }`; `start` opens the sheet on touch devices and clicks the gallery input otherwise.
  - `PhotoSourceSheet` renders the hidden camera input (`capture="environment"`, no `multiple`, `data-photo-source="camera"`) and the `Dialog` (`mobileSheet`, size `sm`). Each option closes the sheet and clicks its input synchronously, so the picker opens within the tap's user activation.
- `CreateVoicePage.tsx` (`MediaInput`), `ConversationPage.tsx` (`Composer`) and `ActionPanel.tsx` (closure evidence) call `source.start` from their existing button and pass their existing gallery input and file handler to the sheet. `uploadEvidence` accepts `FileList | File[]`.
- `styles.css`: `.photo-source` and `.photo-source__option` (52 px minimum target height).
- No API, schema, migration, environment variable, header or dependency change.

## Consequences

- Android 14+ and iOS users can take a photo without leaving CARE; on touch devices adding a photo takes one extra tap.
- Camera captures return one photo per tap; adding several camera photos repeats the action up to the existing limit of five.
- Very large camera originals are already reduced by `compressPhoto` before upload; the server's 10 MB, 40 MP and 10,000 px limits still apply.
- Tablets with a mouse or trackpad that report a fine pointer go straight to the file dialog, which may itself offer a camera on that platform.
- In the closure step the sheet opens above the **Tutup Voice** sheet; focus returns to the trigger when it closes.

## Validation

- Vitest `PhotoSource.test.ts`: coarse pointer selects the sheet, fine pointer and missing or throwing `matchMedia` fall back to the file dialog.
- Playwright `workforce-photo-source.spec.ts` (Chromium):
  - touch emulation on the draft edit form: the sheet lists both options and has no Axe violations; **Ambil foto** opens a chooser whose input has `capture="environment"`, the allowlist and no `multiple`, and the photo uploads to the draft; **Pilih dari galeri** opens the multi-file input without `capture`;
  - chat: a camera photo is added to the composer;
  - closure: a camera photo is posted to `closure-evidence` while **Tutup Voice** stays open;
  - mouse: the button opens the gallery chooser directly and no sheet appears.
- `workforce-legacy.spec.ts` targets the gallery input with `[multiple]`, since the composer now contains two file inputs.
- The browser inventory in `validation.test.mjs` moves from 487 to 491.
- Visual captures are unchanged: capture scenarios use a desktop pointer, so the sheet never opens there.

## Risks

- Browser vendors could change how `capture` or the Android photo picker behaves; the gallery path keeps working either way.
- `(pointer: coarse)` is a heuristic. A misclassified device falls back to the plain file dialog, which was the previous behaviour.

## Follow-up

- Confirm on a real Android 14+ phone (installed PWA and Chrome tab) and an iPhone Home Screen install that **Ambil foto** opens the rear camera and the photo uploads in all three places.
