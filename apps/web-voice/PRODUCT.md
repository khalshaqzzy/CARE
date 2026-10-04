# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Members (reporters):** TMMIN employees, including vocational (TM) members, who report findings, complaints, ideas, information, or appreciation from their phone, often on the production floor.
- **Responders and leadership:** Group Leader, Section Head, Manager/Department Head (including Default PIC), Deputy/Division Head, and Director. They answer, assign, raise, process, and close Voices along a tiered chain, and monitor their unit. They use CARE on both phones (quick actions between shifts) and laptops/PCs (longer review and meetings) in roughly equal measure.
- **Union:** one Union Head and two Union Officers who handle Private Voices.
- **CARE Admin:** operates organization import, categories, escalation calendar and deadlines, and handovers in a separate Admin app.

## Product Purpose

CARE is TMMIN's enterprise member voice channel for a manufacturing environment. Every Voice gets a deterministic route, a clear owner, visible progress, and a recorded resolution with evidence, rating, and reopen. Success means members trust the channel enough to use it, high-risk issues surface early, and responders answer and resolve within the deadlines set for each severity.

## Positioning

Routing comes from the authoritative organization master, not from what the reporter knows about the org chart. General Voices climb a tiered chain (Group Leader → Section Head → Manager → Deputy/Division Head) with per-severity deadlines on a working calendar and automatic escalation. Private Voices go only to Union, with reporter identity governed by immutable per-Voice consent.

## Operating Context

- Mobile-first workforce PWA in Indonesian; leadership also reads dashboards on desktop.
- Old phones are in use: the workforce build targets Safari 11.3 (iOS 11.3), and visuals must not depend on features that break there.
- Responder dashboards follow the actor's organization scope and filters (period, area, organization unit) and switch between **Voice Untuk Saya** (handling) and **Voice Tim Saya** (reported by the actor's unit).
- Statuses are fixed product-wide: **Terbuka**, **Direspons**, **Diproses**, **Selesai**.

## Capabilities and Constraints

- Categories come from an Admin-managed catalog (seed: Safety, Environment, Fasilitas Umum, Facility Repair, Fasilitas Kerja/Kesulitan Kerja, Kesejahteraan); dashboards must use the real catalog, never invented categories.
- Deadlines are per severity and per tier, configured by Admin; there is no single product-wide "SLA" target. Timeliness is measured against those deadlines ("Tepat waktu").
- Per-person handling performance and member participation **may be used as input for formal performance evaluation**. This supersedes the v1 PRD non-goal "not a performance management system", which must be amended. Attribution rules must therefore be explicit and auditable: shared holders all carry a missed deadline; a substitute during "Sedang tidak masuk" carries the work they acted on; fixed categories count toward the assigned PIC.
- Private Voice content is never visible to managers. Participation counts may include Private Voices, as a confirmed product decision.
- Copy stays minimal: short labels, no explanatory paragraphs on screens.
- Unit heads (Group Leader to Deputy/Division Head) use the operations dashboard; Director and Union keep the blue-hero dashboard until a later decision (PRD §18.8.6).
- Personal Voices of a responder are reached from a one-line "Voice saya" entry on Home; the Voice Saya page carries their summary.
- Bottom navigation is labelled for every role and ends with Pengaturan; notifications open from the Home bell.
- No backup/HA/DR in v1 (Critical Accepted Risk); not offline-first; not a native app.

## Brand Commitments

CARE has its own identity and is not bound by TMMIN/Toyota corporate brand rules. Use the CARE name and existing CARE assets. Plus Jakarta Sans (headings and figures) and Inter (body) are the confirmed typefaces, both self-hosted.

## Evidence on Hand

- Product contract: `.agent/PRD.md`; decisions in `docs/adr/`.
- No real usage metrics, testimonials, or benchmarks are on hand; dashboards and mockups must not fabricate comparisons or targets.

## Product Principles

1. Every Voice has one clear owner and a visible next step.
2. Show the deadline that actually applies, never an invented target.
3. Privacy before insight: Private identity and content never leak through aggregates.
4. Numbers that can affect people's evaluation must be traceable to recorded events.
5. Fast to scan on a phone, complete enough to review on a laptop.

## Accessibility & Inclusion

Indonesian UI; must remain usable on old iOS Safari (11.3) and small 360 px screens; keyboard and screen-reader access are covered by existing axe and keyboard tests.
