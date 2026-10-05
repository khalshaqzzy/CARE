---
name: CARE Operations Board
description: The white operations board unit heads use to see whose turn it is and which deadline applies.
colors:
  ink: '#0f172a'
  ink-muted: '#475569'
  ink-faint: '#556275'
  hairline: '#e2e8f0'
  hairline-soft: '#eef2f7'
  tile: '#f8fafc'
  track: '#f1f5f9'
  card: '#ffffff'
  accent: '#2563eb'
  accent-soft: '#eff6ff'
  accent-ink: '#1d4ed8'
  accent-border: '#bfdbfe'
  alert: '#e11d48'
  alert-soft: '#fff1f2'
  alert-ink: '#be123c'
  alert-border: '#fecdd3'
  good: '#047857'
  warning: '#f59e0b'
  warning-soft: '#fffbeb'
  warning-ink: '#b45309'
  warning-border: '#fde68a'
  status-open: '#e11d48'
  status-responded: '#2563eb'
  status-in-progress: '#0891b2'
  status-closed: '#059669'
  severity-low: '#94a3b8'
typography:
  figure-lg:
    fontFamily: "'Plus Jakarta Sans Variable', 'Inter Variable', sans-serif"
    fontSize: '26px'
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: '-0.03em'
  figure-md:
    fontFamily: "'Plus Jakarta Sans Variable', 'Inter Variable', sans-serif"
    fontSize: '22px'
    fontWeight: 700
    lineHeight: 1.15
  figure-sm:
    fontFamily: "'Plus Jakarta Sans Variable', 'Inter Variable', sans-serif"
    fontSize: '16px'
    fontWeight: 700
  headline:
    fontFamily: "'Plus Jakarta Sans Variable', 'Inter Variable', sans-serif"
    fontSize: '16px'
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: '-0.01em'
  title:
    fontFamily: "'Plus Jakarta Sans Variable', 'Inter Variable', sans-serif"
    fontSize: '15px'
    fontWeight: 700
    letterSpacing: '-0.01em'
  ticket-title:
    fontFamily: "'Plus Jakarta Sans Variable', 'Inter Variable', sans-serif"
    fontSize: '14.5px'
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: '13px'
    fontWeight: 400
    fontFeature: "'tnum'"
  label:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: '12px'
    fontWeight: 550
  caption:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: '11px'
    fontWeight: 550
rounded:
  pill: '999px'
  card: '10px'
  segmented: '9px'
  tile: '8px'
  control: '7px'
spacing:
  xs: '6px'
  sm: '8px'
  md: '10px'
  lg: '12px'
  xl: '16px'
components:
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '16px'
  tile:
    backgroundColor: '{colors.tile}'
    textColor: '{colors.ink}'
    rounded: '{rounded.tile}'
    padding: '10px'
  chip:
    backgroundColor: '{colors.tile}'
    textColor: '{colors.ink-muted}'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    padding: '2px 9px'
  chip-accent:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.accent-ink}'
    rounded: '{rounded.pill}'
    padding: '2px 9px'
  chip-alert:
    backgroundColor: '{colors.alert-soft}'
    textColor: '{colors.alert-ink}'
    rounded: '{rounded.pill}'
    padding: '2px 9px'
  filter-chip:
    backgroundColor: '{colors.tile}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    height: '32px'
    padding: '0 10px'
  filter-chip-active:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.accent-ink}'
    rounded: '{rounded.control}'
    height: '32px'
  segmented:
    backgroundColor: '{colors.track}'
    rounded: '{rounded.segmented}'
    padding: '3px'
  segmented-option:
    textColor: '{colors.ink-muted}'
    rounded: '{rounded.control}'
    height: '36px'
    padding: '6px 8px'
  segmented-option-selected:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
  avatar:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.card}'
    rounded: '{rounded.tile}'
    size: '34px'
  alert-strip:
    backgroundColor: '{colors.alert-soft}'
    textColor: '{colors.alert-ink}'
    rounded: '{rounded.card}'
    padding: '10px 14px'
  text-button:
    textColor: '{colors.accent}'
    typography: '{typography.label}'
  bottom-nav-item:
    textColor: '{colors.ink-muted}'
    typography: '{typography.caption}'
    height: '50px'
  bottom-nav-item-active:
    textColor: '{colors.accent}'
---

# Design System: CARE Operations Board

Scope. This file records the operations world as shipped under the `.ops` class in `src/styles.css`: the unit-head Home (Group Leader to Deputy/Division Head, both Voice Untuk Saya and Voice Tim Saya), the Voice Saya summary card, and the labelled bottom navigation for every workforce role. The rest of the workforce app (the blue hero kept for Director and Union, Voice detail, the create flow, auth) is the incumbent CARE system built on `@care/ui` tokens; it is out of scope here and is not described by these tokens.

## Overview

**Creative North Star: "The Shift Board"**

A calm white operations board read between shifts on a phone and in reviews on a laptop. White hairline cards sit on the app's neutral canvas; inside them, tinted tiles carry the figures. Everything is quiet slate except one blue for selection and progress, rose for what is late or still open, and green for what got done. The deadline that applies is always the loudest thing on a ticket.

Density is high but legible: 12-13px Inter labels, Plus Jakarta Sans figures and headings, tabular numerals throughout, and copy kept to short labels. The board refuses the marketing hero and the chart wall; the only chart is one thin trend line inside the status card.

**Key Characteristics:**

- White cards (10px) with hairline slate borders and a barely-there two-layer shadow.
- The profile card is the one cobalt card. It uses `--gradient-brand-hero`, the band behind every other workforce page header, so Home matches them. On it:
  - Text, icons, and the bell are white.
  - The basis trough and the "Voice saya" line are translucent white, and the selected segment is solid white.
  - Filter chips and the refresh button are solid white.
- Tinted slate tiles (8px) hold every figure; pills (999px) hold every count and tag.
- One blue accent; rose, amber, and green appear only as status, severity, or deadline signals.
- Plus Jakarta Sans for headings and figures, Inter for everything else, tabular numerals on the whole board.
- Lucide line icons at 14-17px, coloured faint slate or accent.

## Colors

Slate neutrals with a single blue voice and three signal hues that only ever mean something.

### Primary

- **Operations Blue** (accent): selected segment counts, active filter chips, links and text buttons, progress bars, the trend line, the "Responded" status, focus rings, and the active bottom-nav item. Soft Blue (accent-soft) with Blue Border (accent-border) and Deep Blue text (accent-ink) is its tinted form for active chips and the top-ranked person.

### Signal

- **Overdue Rose** (alert): Terbuka status, overdue and urgent deadlines, missed-deadline figures. Its tinted form (alert-soft, alert-border, alert-ink) carries the overdue strip and Kritis pills.
- **Done Green** (good): Selesai gains ("+N hari ini" on the Selesai tile only) and comparisons that improved.
- **Amber** (warning): Tinggi severity and "menunggu rating" nudges, in tinted form (warning-soft, warning-border, warning-ink).
- **Status set**: Terbuka (status-open), Direspons (status-responded), Diproses (status-in-progress, cyan), Selesai (status-closed). Applied through a single `--ops-status` variable keyed on `data-status`, used for dots and the stacked proportion bar.
- **Severity set**: Kritis rose, Tinggi amber, Sedang blue, Rendah slate (severity-low), shown as 6px dots.

### Neutral

- **Slate Ink** (ink): headings, figures, avatar tiles.
- **Muted Slate** (ink-muted): labels, chip text, inactive segments.
- **Faint Slate** (ink-faint): captions, units, empty states, icons in chips. Deliberately darker than slate-500 so 11-12px captions hold contrast on tinted tiles.
- **Hairline** (hairline): card, tile, chip, and control borders. **Soft Hairline** (hairline-soft): dividers between blocks inside a card.
- **Tile Slate** (tile): tiles, chips, filter controls. **Track Slate** (track): segmented-control trough, bar tracks, neutral badges.
- **Card White** (card): card surfaces and the selected segment.

### Named Rules

**The One Blue Rule.** Blue means selected, in progress, or tappable. It is never decoration and never a second brand gradient.

**The Signal Means Something Rule.** Rose, amber, and green appear only when bound to a status, severity, deadline, or comparison. A "+N hari ini" on a tile other than Selesai stays muted slate.

## Typography

**Display Font:** Plus Jakarta Sans Variable (with Inter Variable, sans-serif), self-hosted woff2, weights 200-800.
**Body Font:** Inter Variable (from `@care/ui`), self-hosted.

**Character:** A geometric, slightly warm grotesque gives the figures weight; Inter keeps dense labels neutral. Variable intermediate weights (550, 650) separate label tiers without jumping to bold.

### Hierarchy

- **Figure large** (700, 26px, 1.1, -0.03em): speed metrics and participation total, with a small 12px unit beside it.
- **Figure medium** (700, 22px, 1.15): status tile counts; 18px in the compact Voice Saya card.
- **Figure small** (700, 15-18px): category, severity, and secondary stat counts.
- **Headline** (700, 16px, 1.35): the person's name in the profile card.
- **Title** (700, 15px, -0.01em, balanced wrap): card headings and the tickets heading. Ticket titles use 14.5px.
- **Body** (400-650, 13px): person names, strip text, rows.
- **Label** (550-650, 12px): metric labels, filter chips, block subheads, text buttons.
- **Caption** (500-600, 10-11.5px): status labels, units, comparisons, axis ticks, nav labels.

### Named Rules

**The Figures In Jakarta Rule.** Every number a head reads as a result is set in Plus Jakarta Sans 700 with tabular numerals; supporting text stays in Inter.

## Layout

One column on phones with a 12px gap; from 768px a two-column grid with a 16px gap, a `72rem` max width, centred, with the profile card and tickets spanning both columns. Cards pad 16px (18px from 768px). Inside a card, sections are separated by a soft hairline and 12px top padding, not by nested boxes.

Tile grids are fixed and equal: four status tiles, three category columns, four severity tiles, two metric tiles per row, 6-8px gaps. Action tickets stack on phones and sit three across from 768px, with the CTA pinned to the bottom so buttons align.

Phone reading order is enforced with CSS order: profile, Status, Kecepatan, Sebaran, Performa, then tickets (handling view); Status, Kecepatan, overdue strip, Partisipasi, Sebaran, Aktivitas (team view). The filter chip row scrolls horizontally on phones with a 28px fade mask at the right edge. Below 1280px the labelled bottom navigation is fixed to the viewport bottom with safe-area padding.

## Elevation & Depth

Nearly flat. Cards lift off the canvas with a hairline plus a very soft two-layer shadow; tiles, chips, and controls are flat and rely on tint and hairline. The only other shadows mark state: the selected segment and the floating create button in the bottom nav.

### Shadow Vocabulary

- **Card rest** (`box-shadow: 0 1px 2px rgb(15 23 42 / 4%), 0 4px 14px rgb(15 23 42 / 3%)`): every `.ops` card.
- **Selected segment** (`box-shadow: 0 1px 3px rgb(15 23 42 / 10%)`): the white selected option in a segmented control.
- **Bottom nav** (`box-shadow: 0 -4px 18px rgb(15 23 42 / 5%)`): the fixed labelled navigation bar.
- **Create button** (`box-shadow: 0 6px 14px rgb(37 99 235 / 32%)`): the raised blue Buat Voice button in the bottom nav, the one lifted element.

### Named Rules

**The One Surface Per Card Rule.** A card holds tiles, but a tile never holds another bordered box; figures inside a person tile sit on a hairline, not a nested panel.

**The Portal Token Rule.** Sheets open in a portal outside `.ops`, so `.ops-sheet` carries the same `--ops-*` tokens. Each person in a "Lihat semua" sheet is its own bordered tile, with an 8px gap between tiles.

## Shapes

Small, consistent corners stepping down with depth: cards 10px, tiles, avatars and person rows 8px, controls and filter chips 7px inside a 9px segmented trough, the profile avatar 10px. Counts, tags, chips, bar tracks, and meters are full pills. Status and severity are 6px dots. Borders are always 1px hairlines; the "Voice saya" entry line is the doorway into the person's own Voices.

## Components

### Buttons

- **Text button:** accent text, 12px/650, leading Lucide icon, no background ("Lihat satu level lebih luas", "Lihat semua").
- **Icon button:** 32px square, 7px radius, tile background, hairline border, muted icon (refresh); 50% opacity when disabled.
- **Ticket CTA:** full-width, 38px high, 8px radius, primary `@care/ui` Button pinned to the card bottom.
- **Focus:** every operations control shows a 2px accent outline at 2px offset (1px inside the segmented control).

### Chips

- **Count chip:** pill, tile background, hairline, 12px/600 muted text ("Total 12", "3 orang"). Accent and alert variants use the tinted pairs.
- **Filter chip:** 32px high, 7px radius, tile background, 14px faint icon; active filters switch to the soft-blue pair. The row scrolls on phones.
- **Ticket pill:** pill, 11.5px/600, with a 6px severity dot; Kritis and Tinggi take tinted rose and amber.
- **Badge:** 10.5px/700 pill on track slate; "Top" in pale green, warning in pale orange.

### Cards / Containers

- **Corner Style:** 10px.
- **Background:** white.
- **Shadow Strategy:** card rest shadow (see Elevation).
- **Border:** 1px hairline.
- **Internal Padding:** 16px, 18px from 768px; 12px internal gap.
- **Head:** title left, count chip right.

### Segmented Control

The basis switcher (Voice Untuk Saya / Voice Tim Saya) and smaller view toggles. Track-slate trough, 3px inset, 7px options; the selected option turns white with ink text, 650 weight, and the selected-segment shadow, and its live count pill turns solid blue with white text. Small (32px) and tiny (28px) sizes exist for in-card toggles. Background and colour transition over 160ms `cubic-bezier(0.16, 1, 0.3, 1)`, removed under reduced motion.

### Navigation

Labelled bottom navigation for every workforce role below 1280px: 96% white bar, top hairline, bottom-nav shadow, five items with 22px Lucide icons over 11px/550 labels in slate. The current page turns accent blue with a 700 label. Buat Voice sits in a raised 44px blue circle that overlaps the bar top by 18px. Labels never hide.

### Status Card (signature)

Four tiles, each with a 6px status dot and label, a 22px figure (Terbuka figure in rose), and a "+N hari ini" caption that is green only on Selesai. Below, a 7px stacked proportion bar in status colours with 2px gaps, then a 72px trend: accent line, 10% accent fill, axis captions. In the Voice Saya summary the tiles are buttons that filter the list; pressed shows the soft-blue pair with an inset accent ring.

### Action Ticket (signature)

The deadline-first ticket. A pill row (severity, category) with the deadline right-aligned: clock icon and "Sisa ..." in muted slate, or rose when urgent or late ("Terlambat ..."). Then the 14.5px title, a 12px faint "Dari:" line, and the full-width CTA at the bottom.

### Person Tile

Tile with an 8px ink avatar of initials (muted slate when inactive), name with optional "Top" badge, role and unit caption, and a four-figure row (Voice, Respons, Tepat waktu, Naik otomatis) on a hairline; missed figures in rose. The top-ranked tile takes the soft-blue pair. Names wrap rather than truncate.

### Alert Strip

Full-width rose-tinted bar (10px radius) with a bell icon, one line of text, and an underlined rose action. The amber button variant nudges unrated closed Voices on the Voice Saya page.

## Do's and Don'ts

### Do:

- **Do** put every figure in a tinted tile (8px) inside a white hairline card (10px); keep one surface level per card.
- **Do** keep blue for selection, progress, links, and focus only; bind rose, amber, and green to status, severity, deadline, or comparison.
- **Do** set figures in Plus Jakarta Sans 700 with tabular numerals and give each a short Inter unit or caption.
- **Do** show the applicable deadline on every action ticket, rose when urgent or late.
- **Do** read status colours from the `data-status` mapping rather than hard-coding new hues.
- **Do** label every bottom-nav item and keep the reading order Status, Kecepatan, Sebaran, people, tickets on phones.

### Don't:

- **Don't** add an uppercase tracked label above a heading; the only uppercase line in this world is the role under the person's name in the profile card.
- **Don't** introduce SLA targets, invented benchmarks, or a chart wall; the single trend line in the status card is the chart budget.
- **Don't** nest a bordered box inside a tile or a card inside a card.
- **Don't** colour a "+N" gain green on any tile but Selesai.
- **Don't** load fonts from a third-party host; both faces are self-hosted (CSP `font-src 'self'`).
- **Don't** apply these tokens to the Director/Union blue hero, Voice detail, or create flow; those remain the incumbent system.
