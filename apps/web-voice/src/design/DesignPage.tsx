import {
  Accordion,
  Alert,
  AnimatedNumber,
  Avatar,
  Badge,
  BottomNav,
  BottomSheet,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Combobox,
  ConfirmDialog,
  ConflictState,
  DataTable,
  Dialog,
  Divider,
  Drawer,
  EmptyState,
  ErrorState,
  FileUpload,
  Grid,
  IconButton,
  Input,
  Link,
  Loader,
  Menu,
  MediaUpload,
  NativeSelect,
  OfflineBanner,
  PageHeader,
  Pagination,
  Panel,
  PermissionState,
  Popover,
  Progress,
  RadioGroup,
  SegmentedControl,
  Select,
  SeverityBadge,
  Sidebar,
  Skeleton,
  Stack,
  StatCard,
  StatusBadge,
  Switch,
  Tabs,
  Textarea,
  Timeline,
  Toast,
  Tooltip,
  breakpointTokens,
  chartTokens,
  choreographyTokens,
  colorTokens,
  densityTokens,
  durationTokens,
  easingTokens,
  elevationTokens,
  focusTokens,
  layerTokens,
  opacityTokens,
  radiusTokens,
  semanticColorTokens,
  spacingTokens,
  springTokens,
  transformTokens,
  typographyTokens,
  publicComponentCoverage,
  publicStateCoverage,
  type Column,
  type UploadItem,
} from '@care/ui';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleGauge,
  ClipboardList,
  Ellipsis,
  Home,
  ListFilter,
  MapPin,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import './design.css';

const navigation = [
  ['overview', 'Overview'],
  ['tokens', 'Tokens'],
  ['actions', 'Actions'],
  ['forms', 'Forms'],
  ['navigation', 'Navigation'],
  ['feedback', 'Feedback'],
  ['overlays', 'Overlays'],
  ['data', 'Data'],
  ['motion', 'Motion'],
  ['patterns', 'Patterns'],
  ['guidelines', 'Guidelines'],
] as const;

const employees = [
  { id: '000128', name: 'Budi Santoso', unit: 'Manufacturing / Welding', status: 'ACTIVE' },
  { id: '000417', name: 'Rina Pratiwi', unit: 'Quality / Inspection', status: 'ACTIVE' },
  { id: '000923', name: 'Dimas Saputra', unit: 'Plant Administration', status: 'LEGACY_HANDLER' },
];

export default function DesignPage() {
  const [toastOpen, setToastOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([
    { id: '1', name: 'temuan-line-a.webp', status: 'success' },
  ]);
  const [motionKey, setMotionKey] = useState(0);
  const columns = useMemo<Column<(typeof employees)[number]>[]>(
    () => [
      { key: 'id', header: 'No. Reg', sortable: true, cell: (row) => row.id },
      { key: 'name', header: 'Nama', sortable: true, cell: (row) => <strong>{row.name}</strong> },
      { key: 'unit', header: 'Organization unit', cell: (row) => row.unit },
      {
        key: 'status',
        header: 'Status',
        cell: (row) => (
          <Badge tone={row.status === 'ACTIVE' ? 'success' : 'warning'}>{row.status}</Badge>
        ),
      },
    ],
    [],
  );

  useEffect(() => {
    document.title = 'CARE Design System';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.append(meta);
    }
    meta.content = 'noindex, nofollow';
  }, []);

  return (
    <div className="design-shell">
      <aside className="design-nav">
        <a className="design-brand" href="#overview">
          <span>C</span>
          <div>
            <strong>CARE</strong>
            <small>Design system</small>
          </div>
        </a>
        <nav aria-label="Bagian design system">
          {navigation.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <p>Light theme · Mock data only</p>
      </aside>
      <main className="design-main">
        <section id="overview" className="design-hero">
          <div className="design-hero__copy">
            <Badge tone="info">Public implementation contract</Badge>
            <h1>CARE interface, dari token hingga workflow.</h1>
            <p>
              System untuk workforce mobile-first dan Admin desktop-only. Cobalt memberi orientasi,
              white surfaces menjaga fokus, dan motion hanya menjelaskan feedback atau perubahan
              state.
            </p>
            <div>
              <Button
                onClick={() =>
                  document.querySelector('#tokens')?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                Jelajahi tokens <ChevronRight size={18} />
              </Button>
              <Link href="#patterns">Lihat composed patterns</Link>
            </div>
          </div>
          <MemberHomePreview compact />
        </section>

        <DesignSection
          id="tokens"
          eyebrow="Foundations"
          title="Token contract"
          description="Raw values diturunkan menjadi semantic roles. Semua public family di bawah ini dipakai oleh komponen dan dapat diperiksa secara visual."
        >
          <TokenGroup title="Brand & neutral colors">
            <div className="swatch-grid">
              {Object.entries(colorTokens).map(([name, value]) => (
                <TokenSwatch key={name} name={`--raw-${name}`} value={value} />
              ))}
            </div>
          </TokenGroup>
          <TokenGroup title="Semantic roles">
            <div className="swatch-grid">
              {Object.entries(semanticColorTokens).map(([name, value]) => (
                <TokenSwatch key={name} name={`--${name}`} value={value} />
              ))}
            </div>
          </TokenGroup>
          <TokenGroup title="Typography">
            <div className="type-specimens">
              <p style={{ fontFamily: typographyTokens.family }}>
                <span>UI family</span>Inter Variable — Suara member ditangani dengan jelas.
              </p>
              {Object.entries(typographyTokens.sizes).map(([name, value]) => (
                <p key={name} style={{ fontSize: value }}>
                  <span>
                    {name} · {value}
                  </span>
                  Detail lokasi dan tindak lanjut yang dapat ditelusuri.
                </p>
              ))}
            </div>
            <div className="token-inline">
              {Object.entries(typographyTokens.weights).map(([name, value]) => (
                <code key={name}>
                  {name} {value}
                </code>
              ))}
              {Object.entries(typographyTokens.lineHeights).map(([name, value]) => (
                <code key={name}>
                  line-{name} {value}
                </code>
              ))}
            </div>
          </TokenGroup>
          <TokenGroup title="Spacing">
            <div className="spacing-specimens">
              {Object.entries(spacingTokens).map(([name, value]) => (
                <div key={name}>
                  <code>space-{name}</code>
                  <span style={{ width: value }} />
                </div>
              ))}
            </div>
          </TokenGroup>
          <Grid min="12rem">
            <TokenGroup title="Radius">
              <div className="mini-grid">
                {Object.entries(radiusTokens).map(([name, value]) => (
                  <div className="radius-specimen" style={{ borderRadius: value }} key={name}>
                    <code>
                      {name}
                      <br />
                      {value}
                    </code>
                  </div>
                ))}
              </div>
            </TokenGroup>
            <TokenGroup title="Elevation">
              <div className="mini-grid">
                {Object.entries(elevationTokens).map(([name, value]) => (
                  <div className="elevation-specimen" style={{ boxShadow: value }} key={name}>
                    <code>{name}</code>
                  </div>
                ))}
              </div>
            </TokenGroup>
          </Grid>
          <Grid min="13rem">
            <CompactTokenList title="Density" values={densityTokens} />
            <CompactTokenList title="Layers" values={layerTokens} />
            <CompactTokenList title="Breakpoints" values={breakpointTokens} />
            <CompactTokenList title="Focus" values={focusTokens} />
            <CompactTokenList title="Opacity" values={opacityTokens} />
            <CompactTokenList title="Chart roles" values={chartTokens} />
          </Grid>
        </DesignSection>

        <DesignSection
          id="actions"
          eyebrow="Components · Actions"
          title="Clear action hierarchy"
          description="Primary untuk satu tindakan utama; secondary untuk alternatif; ghost untuk low-emphasis; danger selalu menyebut konsekuensi."
        >
          <Specimen title="Variant × size">
            <div className="component-row">
              <Button size="sm">Simpan draft</Button>
              <Button>Kirim Voice</Button>
              <Button size="lg">Lanjut ke preview</Button>
              <Button variant="secondary">Kembali</Button>
              <Button variant="ghost">Lihat detail</Button>
              <Button variant="danger">Nonaktifkan akun</Button>
              <IconButton aria-label="Tindakan lain" variant="secondary">
                <MoreHorizontal />
              </IconButton>
            </div>
            <Divider />
          </Specimen>
          <Specimen title="Rendered states">
            <div className="component-row">
              <Button>Default</Button>
              <Button className="is-state-hover">Hover specimen</Button>
              <Button className="is-state-focus">Focus specimen</Button>
              <Button disabled>Disabled</Button>
              <Button loading>Memproses</Button>
            </div>
          </Specimen>
        </DesignSection>

        <DesignSection
          id="forms"
          eyebrow="Components · Inputs"
          title="Labels remain visible"
          description="Helper dan error text terhubung secara programmatic; motion tidak menggantikan pesan atau status."
        >
          <Grid min="19rem">
            <Specimen title="Text fields">
              <Stack>
                <Input
                  label="Judul Voice"
                  helperText="Maksimum 150 karakter."
                  placeholder="Contoh: Pelindung mesin longgar"
                />
                <Input
                  label="Detail lokasi"
                  errorText="Tambahkan line, gedung, atau titik temuan."
                  value="Area produksi"
                  readOnly
                />
                <Input label="Search" leading={<Search size={17} />} value="Welding" readOnly />
                <Textarea
                  label="Detail Voice"
                  helperText="Jelaskan kondisi dan dampaknya."
                  defaultValue="Pelindung mesin terlihat longgar saat pergantian shift."
                />
              </Stack>
            </Specimen>
            <Specimen title="Select & combobox">
              <Stack>
                <NativeSelect label="Area temuan" defaultValue="KARAWANG_1">
                  <option value="KARAWANG_1">Karawang 1</option>
                  <option value="SUNTER_1">Sunter 1</option>
                </NativeSelect>
                <Select
                  label="Severity"
                  defaultValue="HIGH"
                  options={[
                    { value: 'LOW', label: 'Low' },
                    { value: 'MEDIUM', label: 'Medium' },
                    { value: 'HIGH', label: 'High' },
                    { value: 'CRITICAL', label: 'Critical' },
                  ]}
                />
                <Combobox
                  label="Organization unit"
                  defaultValue="welding"
                  options={[
                    { value: 'welding', label: 'Manufacturing / Welding' },
                    { value: 'inspection', label: 'Quality / Inspection' },
                    { value: 'logistics', label: 'Logistics / Delivery' },
                  ]}
                />
              </Stack>
            </Specimen>
          </Grid>
          <Grid min="18rem">
            <Specimen title="Selection controls">
              <Stack>
                <Checkbox
                  label="Tampilkan identitas kepada Union"
                  description="Pilihan disimpan immutable saat Private Voice dikirim."
                  defaultChecked
                />
                <Checkbox label="Disabled selection" disabled />
                <RadioGroup
                  label="Jenis Voice"
                  defaultValue="GENERAL"
                  options={[
                    {
                      value: 'GENERAL',
                      label: 'General Voice',
                      description: 'Ditangani route organisasi.',
                    },
                    {
                      value: 'PRIVATE',
                      label: 'Private Voice',
                      description: 'Ditangani Union Head.',
                    },
                  ]}
                />
                <Switch
                  label="Web Push"
                  description="Best-effort; Notification Center tetap authoritative."
                  defaultChecked
                />
              </Stack>
            </Specimen>
            <Specimen title="Segmented & upload">
              <Stack>
                <SegmentedControl
                  label="Rentang dashboard"
                  defaultValue="weekly"
                  items={[
                    { value: 'weekly', label: 'Mingguan' },
                    { value: 'monthly', label: 'Bulanan' },
                  ]}
                />
                <FileUpload
                  label="Tambahkan foto temuan"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  items={uploadItems}
                  onFilesAdded={(files) =>
                    setUploadItems((current) => [
                      ...current,
                      ...files.map((file, index) => ({
                        id: `${Date.now()}-${index}`,
                        name: file.name,
                        status: 'queued' as const,
                      })),
                    ])
                  }
                  onRemove={(id) =>
                    setUploadItems((current) => current.filter((item) => item.id !== id))
                  }
                />
              </Stack>
            </Specimen>
          </Grid>
        </DesignSection>

        <DesignSection
          id="navigation"
          eyebrow="Components · Navigation"
          title="Capability-aware, not role-themed"
          description="Navigation dapat berubah berdasarkan capability, tetapi backend tetap authoritative untuk setiap object."
        >
          <Specimen title="Tabs & breadcrumbs">
            <Breadcrumbs
              items={[
                { label: 'Beranda', href: '#' },
                { label: 'Voice Member', href: '#' },
                { label: 'CARE-202608-000128' },
              ]}
            />
            <Tabs
              label="Voice detail sections"
              defaultValue="timeline"
              items={[
                {
                  value: 'timeline',
                  label: 'Timeline',
                  content: <Panel className="inline-panel">Timeline aktif dan append-only.</Panel>,
                },
                {
                  value: 'conversation',
                  label: 'Percakapan',
                  content: (
                    <Panel className="inline-panel">Chat immutable dengan attachment.</Panel>
                  ),
                },
                {
                  value: 'closure',
                  label: 'Penyelesaian',
                  content: <Panel className="inline-panel">Closure cycle dan rating.</Panel>,
                },
              ]}
            />
          </Specimen>
          <Grid min="19rem">
            <Specimen title="Pagination">
              <Pagination page={page} pageCount={5} onPageChange={setPage} />
            </Specimen>
            <Specimen title="Accordion">
              <Accordion
                defaultValue="routing"
                items={[
                  {
                    id: 'routing',
                    title: 'Bagaimana route ditentukan?',
                    content:
                      'General Voice memakai category dan organization snapshot; Private Voice selalu menuju Union Head.',
                  },
                  {
                    id: 'offline',
                    title: 'Apa yang tersedia offline?',
                    content:
                      'Hanya app shell dan ringkasan non-sensitif yang diizinkan. Mutation selalu online.',
                  },
                ]}
              />
            </Specimen>
          </Grid>
          <Specimen title="Mobile bottom navigation">
            <div className="bottom-nav-specimen">
              <BottomNav
                current="home"
                items={[
                  { id: 'home', label: 'Beranda', icon: <Home size={20} /> },
                  { id: 'voices', label: 'Riwayat', icon: <ClipboardList size={20} /> },
                  { id: 'calendar', label: 'Aktivitas', icon: <CalendarDays size={20} /> },
                  { id: 'account', label: 'Akun', icon: <UserRound size={20} /> },
                ]}
              />
            </div>
          </Specimen>
        </DesignSection>

        <DesignSection
          id="feedback"
          eyebrow="Components · Feedback"
          title="State must include recovery"
          description="Color, icon, label, dan next action bekerja bersama; loading menjaga ukuran dan mencegah duplicate submit."
        >
          <Specimen title="Badges">
            <div className="component-row">
              <Badge>Neutral</Badge>
              <Badge tone="info">Informasi</Badge>
              <Badge tone="success">Selesai</Badge>
              <Badge tone="warning">Perlu review</Badge>
              <Badge tone="danger">Critical</Badge>
              <SeverityBadge severity="LOW" />
              <SeverityBadge severity="MEDIUM" />
              <SeverityBadge severity="HIGH" />
              <SeverityBadge severity="CRITICAL" />
              <StatusBadge status="IN_PROGRESS" />
            </div>
          </Specimen>
          <Grid min="19rem">
            <Alert tone="info" title="Classification tersedia">
              Category dan severity berasal dari snapshot terbaru.
            </Alert>
            <Alert tone="success" title="Draft tersimpan">
              Lampiran dan input aman untuk dilanjutkan.
            </Alert>
            <Alert tone="warning" title="Lokasi belum lengkap">
              Tambahkan line atau titik temuan agar penanganan lebih tepat.
            </Alert>
            <Alert tone="danger" title="Route belum tersedia">
              Draft tetap tersimpan. Hubungi CARE Admin atau gunakan Private Voice.
            </Alert>
          </Grid>
          <Grid min="18rem">
            <Specimen title="Loading & progress">
              <Stack>
                <Loader label="Memuat klasifikasi" />
                <Progress
                  label="9 dari 12 tugas"
                  value={75}
                  description="Tiga tindakan masih terbuka."
                />
                <Skeleton />
                <Skeleton className="skeleton-lg" />
              </Stack>
            </Specimen>
            <Specimen title="Empty, error, permission, offline, conflict">
              <Stack>
                <EmptyState
                  title="Belum ada Voice"
                  description="Buat Voice pertama untuk memulai tindak lanjut."
                  action={
                    <Button size="sm">
                      <Plus size={16} />
                      Buat Voice
                    </Button>
                  }
                />
                <ErrorState
                  title="Riwayat gagal dimuat"
                  description="Koneksi terputus sebelum data diterima."
                  onRetry={() => undefined}
                />
                <PermissionState />
                <OfflineBanner />
                <ConflictState onReload={() => undefined} />
              </Stack>
            </Specimen>
          </Grid>
          <Button variant="secondary" onClick={() => setToastOpen(true)}>
            Tampilkan toast
          </Button>
          <Toast
            open={toastOpen}
            onOpenChange={setToastOpen}
            tone="success"
            title="Perubahan tersimpan"
            description="Mapping PIC akan berlaku untuk Voice baru."
          />
        </DesignSection>

        <DesignSection
          id="overlays"
          eyebrow="Components · Overlays"
          title="Focus enters, stays, and returns"
          description="Escape, outside click, accessible naming, dan focus return didelegasikan ke accessible primitives."
        >
          <div className="component-row">
            <Tooltip content="Buka notifikasi">
              <IconButton variant="secondary" aria-label="Buka notifikasi">
                <Bell />
              </IconButton>
            </Tooltip>
            <Popover
              trigger={<Button variant="secondary">Buka popover</Button>}
              label="Ringkasan route"
            >
              <Stack>
                <strong>PIC Global</strong>
                <span>Safety · Environment · Facility</span>
              </Stack>
            </Popover>
            <Menu
              trigger={
                <IconButton variant="secondary" aria-label="Buka menu">
                  <Ellipsis />
                </IconButton>
              }
              items={[
                { id: 'view', label: 'Lihat detail', onSelect: () => undefined },
                { id: 'reset', label: 'Reset password', onSelect: () => undefined },
                { id: 'deactivate', label: 'Nonaktifkan', danger: true, onSelect: () => undefined },
              ]}
            />
            <Dialog
              trigger={<Button variant="secondary">Buka dialog</Button>}
              title="Detail lokasi belum lengkap"
              description="Voice tetap dapat dilanjutkan setelah acknowledgment."
              footer={<Button>Ya, lanjutkan</Button>}
            >
              <Alert tone="warning" title="Konsekuensi">
                Voice berpotensi tidak ditangani dengan baik tanpa detail lokasi yang cukup.
              </Alert>
            </Dialog>
            <ConfirmDialog
              trigger={<Button variant="danger">Tindakan destructive</Button>}
              title="Nonaktifkan akun?"
              description="Semua session aktif akan dicabut dan login baru ditolak."
              destructive
              onConfirm={() => undefined}
            />
            <Drawer
              trigger={<Button variant="secondary">Desktop drawer</Button>}
              title="Detail akun"
              description="Drawer menjaga konteks tabel Admin."
            >
              <p>Konten drawer memakai focus trap dan focus return yang sama.</p>
            </Drawer>
            <BottomSheet
              trigger={<Button variant="secondary">Mobile sheet</Button>}
              title="Pilih lampiran"
              description="Pada mobile, dialog kompleks menggunakan full-height sheet."
            >
              <MediaUpload label="Pilih foto" onFilesAdded={() => undefined} />
            </BottomSheet>
          </div>
        </DesignSection>

        <DesignSection
          id="data"
          eyebrow="Components · Data display"
          title="Dense where needed, readable everywhere"
          description="Structured data memakai table semantics dan internal overflow; mobile product pages dapat mengganti tabel dengan card representation."
        >
          <Grid min="14rem">
            <StatCard
              label="Voice aktif"
              value={<AnimatedNumber value={128} label="Voice aktif" />}
              description="Mock data specimen"
              icon={<MessageSquareText />}
              tone="brand"
            />
            <StatCard
              label="In progress"
              value="34"
              description="Status operational"
              icon={<CircleGauge />}
            />
            <StatCard
              label="Critical"
              value="3"
              description="Perlu prioritas"
              icon={<AlertTriangle />}
              tone="warning"
            />
          </Grid>
          <DataTable
            caption="Mock workforce account data"
            columns={columns}
            rows={employees}
            rowKey={(row) => row.id}
            selectable
          />
          <Grid min="19rem">
            <Specimen title="Timeline">
              <Timeline
                items={[
                  {
                    id: '1',
                    title: 'Voice dikirim',
                    description: 'Route owner disnapshot.',
                    timestamp: '26 Agu 2026 · 09:41',
                    icon: <Check size={12} />,
                  },
                  {
                    id: '2',
                    title: 'Reporter diminta detail',
                    description: 'Percakapan verifikasi dimulai.',
                    timestamp: '26 Agu 2026 · 10:12',
                    icon: <MessageSquareText size={12} />,
                  },
                  {
                    id: '3',
                    title: 'In progress',
                    description: 'PIC mulai menangani temuan.',
                    timestamp: '26 Agu 2026 · 13:05',
                    icon: <Sparkles size={12} />,
                  },
                ]}
              />
            </Specimen>
            <Specimen title="Avatar">
              <div className="component-row">
                <Avatar size="sm" name="Rina Pratiwi" />
                <Avatar name="Budi Santoso" />
                <Avatar size="lg" name="Dimas Saputra" />
              </div>
            </Specimen>
          </Grid>
        </DesignSection>

        <DesignSection
          id="motion"
          eyebrow="Motion system"
          title="Feedback, continuity, hierarchy"
          description="Specimens memakai object yang sama agar duration dan easing dapat dibandingkan. Reduced motion menghapus perpindahan dan loop dekoratif."
        >
          <Button variant="secondary" onClick={() => setMotionKey((value) => value + 1)}>
            Replay motion
          </Button>
          <Grid min="16rem">
            <TokenGroup title="Durations">
              <div className="motion-list" key={`duration-${motionKey}`}>
                {Object.entries(durationTokens).map(([name, value]) => (
                  <MotionSpecimen key={name} label={`${name} · ${value}ms`} duration={value} />
                ))}
              </div>
            </TokenGroup>
            <TokenGroup title="Easing">
              <div className="motion-list" key={`easing-${motionKey}`}>
                {Object.entries(easingTokens).map(([name, value]) => (
                  <MotionSpecimen
                    key={name}
                    label={name}
                    duration={durationTokens.overlay}
                    easing={value}
                  />
                ))}
              </div>
            </TokenGroup>
          </Grid>
          <Grid min="14rem">
            <CompactTokenList title="Springs" values={springTokens} />
            <CompactTokenList title="Transforms" values={transformTokens} />
            <CompactTokenList title="Choreography" values={choreographyTokens} />
          </Grid>
          <Alert tone="info" title="Reduced-motion fallback">
            Hover lift, spring travel, shimmer, spin, dan overlay offset menjadi instant atau
            opacity-only. State dan focus tetap terlihat.
          </Alert>
        </DesignSection>

        <DesignSection
          id="patterns"
          eyebrow="Composed patterns"
          title="CARE in context"
          description="Mock patterns membuktikan primitives bekerja sebagai product UI; angka dan identitas di sini bukan data authoritative."
        >
          <div className="pattern-grid">
            <MemberHomePreview />
            <CreateVoicePreview />
            <AdminPreview />
          </div>
        </DesignSection>

        <DesignSection
          id="guidelines"
          eyebrow="Usage & quality"
          title="Completion gates"
          description="Sistem belum dianggap lengkap hanya karena default state terlihat."
        >
          <div className="guideline-grid">
            <Guideline
              title="Accessibility"
              items={[
                'WCAG 2.1 AA untuk text/control utama',
                'Visible focus dan minimum 44×44 touch target',
                'Dialog trap/restore focus; Escape dan outside-click policy',
                'Errors memakai text dan programmatic descriptions',
              ]}
            />
            <Guideline
              title="Responsive"
              items={[
                'Workforce: 360 / 768 / 1280 breakpoints',
                'Admin hard gate sebelum 1280 px',
                'Tidak ada document-level overflow',
                'Wide tables scroll di container sendiri',
              ]}
            />
            <Guideline
              title="Motion"
              items={[
                'Transform dan opacity untuk feedback',
                'Tidak ada essential content bergantung animation',
                'Loading menjaga layout dan aria-busy',
                'Reduced motion selalu punya fallback',
              ]}
            />
            <Guideline
              title="Privacy"
              items={[
                'Design route hanya mock data',
                'Tidak ada API/session call di /design',
                'Private content/media selalu network-only',
                'Admin tidak memiliki service worker atau offline cache',
              ]}
            />
          </div>
          <Specimen title="Rendered coverage summary">
            <div className="coverage-table">
              {Object.entries(publicStateCoverage).flatMap(([group, states]) => [
                <span key={`${group}-label`}>{group}</span>,
                <strong key={`${group}-states`}>{states.join(' · ')}</strong>,
              ])}
            </div>
            <div className="component-registry" aria-label="Public component registry">
              {Object.values(publicComponentCoverage)
                .flat()
                .map((name) => (
                  <code key={name}>{name}</code>
                ))}
            </div>
          </Specimen>
        </DesignSection>
      </main>
    </div>
  );
}

function DesignSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="design-section">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <Stack gap="lg">{children}</Stack>
    </section>
  );
}
function Specimen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="specimen">
      <p className="specimen__label">{title}</p>
      {children}
    </Card>
  );
}
function TokenGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="token-group">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
function TokenSwatch({ name, value }: { name: string; value: string }) {
  return (
    <button
      className="token-swatch"
      type="button"
      title="Copy token name"
      onClick={() => void navigator.clipboard?.writeText(name)}
    >
      <span style={{ background: value }} />
      <code>{name}</code>
      <small>{value}</small>
    </button>
  );
}
function CompactTokenList({ title, values }: { title: string; values: object }) {
  return (
    <TokenGroup title={title}>
      <div className="compact-token-list">
        {Object.entries(values).map(([name, value]) => (
          <div key={name}>
            <code>{name}</code>
            <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
          </div>
        ))}
      </div>
    </TokenGroup>
  );
}
function MotionSpecimen({
  label,
  duration,
  easing,
}: {
  label: string;
  duration: number;
  easing?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="motion-specimen">
      <code>{label}</code>
      <div>
        <motion.span
          initial={{ x: 0 }}
          animate={{ x: reduce ? 0 : 112 }}
          transition={{
            duration: reduce ? 0 : duration / 1000,
            ...(easing ? { ease: easing as never } : {}),
          }}
        />
      </div>
    </div>
  );
}
function Guideline({ title, items }: { title: string; items: string[] }) {
  return (
    <Card className="guideline-card">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>
            <Check size={16} />
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MemberHomePreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`member-preview${compact ? ' is-compact' : ''}`}>
      <header>
        <div>
          <Avatar name="Member CARE" />
          <span>
            <strong>Selamat pagi</strong>
            <small>Rabu, 26 Agustus 2026</small>
          </span>
        </div>
        <IconButton aria-label="Buka notifikasi" variant="ghost">
          <Bell size={19} />
        </IconButton>
        <div className="member-preview__heading">
          <span>Performa tindak lanjut</span>
          <Badge>Weekly</Badge>
        </div>
        <Card className="member-progress">
          <div>
            <ClipboardList size={18} />
            <strong>12 tugas</strong>
          </div>
          <div>
            <span>
              <strong>09</strong>/12 tugas
            </span>
            <strong>75%</strong>
          </div>
          <Progress value={75} label="Progress mingguan" />
        </Card>
      </header>
      <main>
        <div className="member-preview__section-title">
          <strong>Voice terbaru</strong>
          <Button size="sm">
            <Plus size={16} />
            Buat Voice
          </Button>
        </div>
        <div className="voice-card-row">
          <Card className="voice-mini-card">
            <strong>Pelindung mesin longgar</strong>
            <p>
              <MapPin size={15} />
              Welding · Line A
            </p>
            <div>
              <SeverityBadge severity="HIGH" />
              <StatusBadge status="IN_PROGRESS" />
            </div>
          </Card>
          <Card className="voice-mini-card">
            <strong>Penerangan area inspeksi</strong>
            <p>
              <MapPin size={15} />
              Quality · Gate 2
            </p>
            <div>
              <SeverityBadge severity="MEDIUM" />
              <StatusBadge status="OPEN" />
            </div>
          </Card>
        </div>
      </main>
      <BottomNav
        current="home"
        items={[
          { id: 'home', label: 'Beranda', icon: <Home size={20} /> },
          { id: 'history', label: 'Riwayat', icon: <ClipboardList size={20} /> },
          { id: 'notifications', label: 'Notifikasi', icon: <Bell size={20} /> },
          { id: 'account', label: 'Akun', icon: <UserRound size={20} /> },
        ]}
      />
    </div>
  );
}

function CreateVoicePreview() {
  return (
    <Card className="create-pattern">
      <p className="care-eyebrow">Create Voice · step 1</p>
      <h3>Pilih jalur Voice</h3>
      <p>Pilihan menentukan routing dan bagaimana identitas ditampilkan.</p>
      <Card variant="selected" className="voice-type-card">
        <div>
          <ShieldCheck />
          <span>
            <strong>Private Voice</strong>
            <small>Ditangani Union Head</small>
          </span>
        </div>
        <Check />
      </Card>
      <Card className="voice-type-card">
        <div>
          <UsersRound />
          <span>
            <strong>General Voice</strong>
            <small>Ditangani route organisasi</small>
          </span>
        </div>
      </Card>
      <Alert tone="info" title="Identitas mengikuti consent">
        Union hanya menerima profil jika reporter memilih Ya.
      </Alert>
      <Button>Lanjutkan</Button>
    </Card>
  );
}

function AdminPreview() {
  const items = [
    { id: 'overview', label: 'Overview', icon: <CircleGauge /> },
    { id: 'imports', label: 'Import & Master', icon: <Upload /> },
    { id: 'routes', label: 'Remediation', icon: <ListFilter /> },
  ];
  return (
    <div className="admin-pattern">
      <Sidebar items={items} current="overview" defaultCollapsed header={<strong>CARE</strong>} />
      <main>
        <PageHeader
          eyebrow="Admin desktop"
          title="Organization health"
          description="Network-only operational surface."
        />
        <Grid min="10rem">
          <StatCard label="Active accounts" value="7.018" />
          <StatCard label="Open issues" value="12" tone="warning" />
        </Grid>
        <Alert tone="warning" title="12 organization units perlu default PIC">
          Selesaikan remediation sebelum General Voice dapat dirutekan.
        </Alert>
      </main>
    </div>
  );
}
