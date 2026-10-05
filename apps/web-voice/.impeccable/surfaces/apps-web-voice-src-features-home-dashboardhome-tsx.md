---
version: 1
slug: 'apps-web-voice-src-features-home-dashboardhome-tsx'
primary_target: 'apps/web-voice/src/features/home/DashboardHome.tsx'
related_targets: ['apps/web-voice/src/App.tsx']
---

# Surface brief: responder dashboard (workforce Home for GL/SH/Manager/Division)

Scope: `apps/web-voice/src/features/home/DashboardHome.tsx` plus the workforce bottom navigation (all roles). Mode: Operate.

Audience and job: unit heads check what needs them now (Voice Untuk Saya) and how their unit reports and is served (Voice Tim Saya), on phones between shifts and on laptops in reviews. Performance and participation figures may feed formal evaluation, so every number must trace to recorded events.

Constraints: fixed statuses Terbuka/Direspon/Diproses/Selesai; real category catalog; deadlines per severity and tier (no SLA targets); Private content never shown; minimal copy; Safari 11.3 and 360 px; self-hosted fonts only (CSP font-src 'self').

Pinned direction: two user-supplied HTML mockups (white ops dashboard). Translated, not copied: no eyebrow above headings, no invented targets, no "Verifikasi Lapangan", no update timestamp footer.

## Direction contract

THESIS: A calm white operations board where the deadline that applies is always visible; refuses the blue marketing hero and chart-wall dashboard.

OWN-WORLD: Slate-50 ground, white 8px cards with hairline slate-200 borders and soft offset shadows, slate-900 ink, one blue accent (#2563eb) for selection and links, rose for overdue/Terbuka, emerald for gains/Selesai, amber for Tinggi. Plus Jakarta Sans for headings and figures, Inter for body. Lucide line icons. Tinted 6px tiles inside cards; pill chips for counts.

STORY: The head sees whose turn it is, how fast the unit answers versus last period, where Voices come from and go, which leaders and members stand out, then acts on the most urgent Voice.

FIRST VIEWPORT: Profile card (initials tile, greeting, name, role, bell) with full-width segmented switcher carrying live counts, then a chip row (unit, area, period, more filters, refresh); below it the Status Voice card: four tiles with "+N hari ini" and a stacked proportion bar.

FORM: Pinned by user mockups; no concept-seed roll (brief-pinned direction). Signature move: deadline-first action tickets with a live "Sisa …" countdown chip.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
