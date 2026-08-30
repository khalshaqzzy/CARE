# CARE Member Voice — Mobile Image Redesign

Canonical handoff untuk audit visual dan 25 mockup mobile standalone CARE Member Voice.

## Scope

- Mobile 360-class PWA only.
- Image concept only; tidak mengubah React, API, schema, atau design-system code.
- Role: Member, Manager, Section Head/Responder, Leadership, Union Head, dan Union Officer.
- Generator: built-in `image_gen`, taxonomy `ui-mockup`.
- Art direction: `.agent/design-images/design.jpg`.
- Functional references: current captures dan `.agent/PRD.md`.

## Folder

- `auth/`: login dan temporary password.
- `member-home/`: dashboard Member dan More sheet.
- `create-voice/`: end-to-end General/Private creation flow.
- `history/`: daftar Voice milik pelapor.
- `voice-detail/`: conversation, closure, rating, dan reopen.
- `notifications/`, `account/`: utility pages.
- `manager/`: dashboard, operational inbox, lifecycle action sheet.
- `leadership/`: read-only executive overview.
- `union/`: home, Private inbox, anonymous/identified detail, General read-only.

Lihat [manifest.md](./manifest.md) untuk mapping current-to-concept dan [prompts.md](./prompts.md) untuk prompt final.

## Design lock

- Solid CARE cobalt menjadi aksen dominan; white/cool-gray canvas dan charcoal text.
- Refined grotesk, medium soft radius, subtle shadow, cards lapang, realistic safe areas.
- Floating bottom navigation dan thin premium-neutral phone frame konsisten.
- Member Home mempertahankan core dashboard lama: cobalt hero, white inset status summary, recent Voice, quick action, dan floating dock.
- Create Voice memakai timeline lima node yang tipis, selected route solid cobalt, cards lebih tinggi, dan composition yang minimalist/polished.
- Private anonymous tidak pernah memuat nama, nomor registrasi, division, department, initials, portrait, atau identity hint.
- Leadership dan Union General bersifat read-only tanpa lifecycle controls.

