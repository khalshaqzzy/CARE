# Final Image-Generation Prompts

Each final prompt is the global prompt below plus exactly one screen directive. Reference order is always: `design.jpg` as visual/style reference, matching current capture as functional reference, then the nearest accepted concept as consistency anchor. The current capture is never treated as a layout to preserve, except screen 03 whose core dashboard is intentionally retained.

## Global prompt

> Create one standalone portrait mobile `ui-mockup` for CARE Member Voice. Use a single thin premium-neutral generic phone frame, show the full screen, and use realistic 360-class PWA proportions with equal exterior margins and top/bottom safe areas. Indonesian UI, refined grotesk, readable at normal size, 44px touch targets. Sleek, minimalist, polished premium enterprise quality. Palette: dominant solid CARE cobalt blue, white/cool-gray canvas, charcoal text, restrained severity colors. Use generous spacing, medium soft radii, subtle shadows, and calm card-led modular composition. No purple, gradients, glassmorphism, brutalism, random decoration, chart clutter, nested-card excess, generic icons, excessive pills, or tiny text. `design.jpg` is art direction; the old capture is function/data reference only. Preserve role permissions and Private Voice privacy invariants.

## Screen directives

1. **Login** — CARE mark, concise welcome, registration-number and password fields, password visibility, primary `Masuk`, help link; confident cobalt hero and clean authentication surface.
2. **Temporary password** — title `Buat password baru`, temporary-password context, new/confirm fields, visible strength and concise rules, dominant `Simpan password`, secure and calm.
3. **Member Home** — retain the current core design: cobalt greeting/identity hero, generous white inset `Status Voice Anda`, recent Voice, quick actions, and floating dock; improve spacing and finish only.
4. **More sheet** — show Member Home dimmed behind a rounded-top sheet with profile summary and large rows `Notifikasi`, `Akun`, `Bantuan`, `Keluar`; safe sticky bottom spacing.
5. **Voice type** — minimalist five-node hairline timeline with one small active cobalt node and `Langkah 1 dari 5`; two tall route cards; chosen `General Voice` is a dominant solid-cobalt card, `Private Voice` remains spacious white; CTA `Lanjut`.
6. **General form** — keep the five-node timeline; location ribbon, one large `Ceritakan Voice Anda` composer, photo attachment shelf, concise helper, sticky `Analisis dengan AI`; no dense boxed form.
7. **Private form + consent** — same calm composer, visible privacy explanation and shield, tall consent choices with selected consent as solid cobalt, photo shelf, sticky AI CTA; no PII preview.
8. **AI analysis** — dominant calm cobalt focus surface with subtle processing orbit, readable stages `Membaca konteks`, `Mengelompokkan`, `Menilai prioritas`, and safe cancel action; no futuristic/brutalist decoration.
9. **Manual fallback** — recoverable failure copy, compact AI result context, spacious manual fields for category/severity/area, strong `Lanjutkan`, secondary `Coba lagi`; never blame the user.
10. **General preview** — dominant cobalt classification summary, clean report preview, category/severity/area chips used sparingly, attachment row, `Kirim General Voice`, and back-to-edit action.
11. **Private preview** — cobalt privacy summary, alias/identity mode, consent confirmation, concise content and classification preview, warning about recipient visibility, `Kirim Private Voice`.
12. **Voice Saya** — status-first history with compact search/filter, General/Private segmented control, generous cards showing title, status, severity, time, PIC where allowed, floating Member dock.
13. **Reporter conversation detail** — tasteful solid-cobalt Voice summary, status/PIC/classification, slim lifecycle timeline, spacious conversation, attachment, fixed reply composer; unique but calm and polished.
14. **Closed, rating, reopen** — closed cobalt summary, resolution note/evidence, five-star feedback module, submitted rating state, quiet `Buka kembali Voice` and clear lifecycle context.
15. **Notifications** — grouped `Hari ini` and `Sebelumnya`, priority/read-state accents, clear Voice context and timestamps, mark-all-read action, Member floating dock.
16. **Account** — cobalt identity hero, member number and role, large grouped rows for profile, password/security, privacy, help, and logout; minimal disclosure and generous spacing.
17. **Manager dashboard** — preserve Member dashboard core; identity `Budi Santoso · Operasional Responder`, personal status inset, organization/30-day ribbon, `42 Total`, `30 Aktif`, `3 Critical`, restrained status/trend, inbox preview, `Buat Voice`, Manager dock.
18. **Voice Member inbox** — cobalt summary `30 Aktif · 3 Critical · 5 Menunggu assignment`, search, compact filters, severity-first spacious list with area/category/status/PIC, no reporter PII, Voice Member tab active.
19. **Responder action sheet** — General detail behind a rising `Tutup Voice` sheet; resolution textarea, evidence-photo picker, reporter-visibility note, `Batal` and solid-cobalt `Tutup Voice`; no Private identity leakage.
20. **Leadership read-only** — `Andi Pratama · Director`, explicit `Leadership · Read-only`, aggregate KPIs/trend/status/areas, privacy note, absolutely no assign/close/edit/comment lifecycle action.
21. **Union Home** — `Dewi Lestari · Union Head`, Private summary `12 Total · 7 Aktif · 2 Menunggu penugasan`, assignment banner, alias-only latest list, compact General read-only strip, Union-specific five-tab dock with no create.
22. **Union Private inbox** — summary, search/filter, severity-first list using `Reporter Biru` aliases only, PIC and assignment state; never show name, registration, organization identity, initials, or portrait.
23. **Anonymous assignment** — Private detail for `Reporter Biru 47` with explicit `Identitas disembunyikan`; bottom sheet `Tugaskan Officer`, selected officer as solid-cobalt row, sticky `Tugaskan`; zero identity hints.
24. **Identified Private detail** — explicit consent band `Identitas ditampilkan atas persetujuan pelapor`; only `Sari Wulandari`, registration `000129`, `Division A · Department A`; report, attachment, conversation; no additional PII or lifecycle sheet.
25. **Union General read-only** — `General Voice · Union · Read-only`, aggregate KPIs, status/category/trend, attention rows, no reporter identity and no operational actions, Union `General` tab active.

