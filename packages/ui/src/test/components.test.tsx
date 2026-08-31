import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { vi } from 'vitest';
import { Button } from '../primitives.js';
import {
  Checkbox,
  Combobox,
  Input,
  PasswordInput,
  RatingInput,
  Select,
  SegmentedControl,
} from '../forms.js';
import { Dialog } from '../overlays.js';
import { Lightbox } from '../lightbox.js';
import { DotLabel } from '../feedback.js';
import {
  ChoiceCardGroup,
  DisclosureRow,
  KeyValueGrid,
  SectionCard,
  SettingsGroup,
  SettingsRow,
} from '../sections.js';

describe('interactive component contracts', () => {
  it('keeps a loading button named, busy, and disabled', () => {
    render(<Button loading>Simpan</Button>);
    const button = screen.getByRole('button', { name: 'Simpan' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('supports uncontrolled and controlled selection', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState('weekly');
      return (
        <SegmentedControl
          label="Rentang"
          value={value}
          defaultValue="weekly"
          onValueChange={setValue}
          items={[
            { value: 'weekly', label: 'Mingguan' },
            { value: 'monthly', label: 'Bulanan' },
          ]}
        />
      );
    }
    render(
      <>
        <Checkbox label="Uncontrolled" />
        <Controlled />
      </>,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Uncontrolled' }));
    expect(screen.getByRole('checkbox', { name: 'Uncontrolled' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Bulanan' }));
    expect(screen.getByRole('radio', { name: 'Bulanan' })).toHaveAttribute('aria-checked', 'true');
  });

  it('supports combobox arrow navigation and enter selection', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        label="Unit"
        options={[
          { value: 'a', label: 'Welding' },
          { value: 'b', label: 'Inspection' },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Pilih opsi' }));
    const search = screen.getByRole('textbox', { name: 'Cari Unit' });
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('button', { name: 'Inspection' })).toBeVisible();
    await waitFor(() => {
      expect(search).not.toBeInTheDocument();
    });
  });

  it('uses an operable native select when enhanced positioning APIs are unavailable', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: undefined });
    Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: undefined });
    render(
      <Select
        label="Status"
        placeholder="Pilih status"
        onValueChange={onChange}
        options={[
          { value: 'OPEN', label: 'Open' },
          { value: 'CLOSED', label: 'Closed' },
        ]}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Status' });
    expect(select.tagName).toBe('SELECT');
    await user.selectOptions(select, 'CLOSED');
    expect(onChange).toHaveBeenCalledWith('CLOSED');
  });

  it('traps dialog focus, closes with Escape, and returns focus', async () => {
    const user = userEvent.setup();
    render(
      <Dialog title="Konfirmasi" description="Periksa data" trigger={<Button>Buka</Button>}>
        <Button>Di dalam</Button>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Buka' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tutup dialog' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('renders accessible field and component state specimens', async () => {
    const { container } = render(
      <main>
        <Input label="Judul" helperText="Maksimum 150 karakter" />
        <Input label="Lokasi" errorText="Lokasi wajib diisi" />
        <Button disabled>Nonaktif</Button>
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getByLabelText('Lokasi')).toHaveAccessibleDescription('Lokasi wajib diisi');
  });

  it('toggles password visibility through a labelled pressed control', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <main>
        <PasswordInput label="Password" autoComplete="current-password" />
      </main>,
    );
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    const toggle = screen.getByRole('button', { name: 'Tampilkan password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(field).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Sembunyikan password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('composed section contracts', () => {
  it('renders section header slots with an accessible counter field', () => {
    render(
      <SectionCard
        title="Profil organisasi"
        description="Unit efektif dari snapshot terbaru"
        icon={<span>icon</span>}
        action={<span>3 aktif</span>}
      >
        <Input label="Judul" counter="12/150" />
      </SectionCard>,
    );
    expect(screen.getByRole('heading', { name: 'Profil organisasi' })).toBeInTheDocument();
    expect(screen.getByText('3 aktif')).toBeInTheDocument();
    expect(screen.getByText('12/150')).toBeInTheDocument();
  });

  it('supports controlled choice-card selection with radio semantics', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState('GENERAL');
      return (
        <ChoiceCardGroup
          label="Jenis Voice"
          value={value}
          onValueChange={setValue}
          options={[
            {
              value: 'GENERAL',
              label: 'General Voice',
              description: 'Ditangani route organisasi.',
            },
            { value: 'PRIVATE', label: 'Private Voice', description: 'Ditangani Union Head.' },
          ]}
        />
      );
    }
    const { container } = render(<Controlled />);
    await user.click(screen.getByRole('radio', { name: /Private Voice/ }));
    expect(screen.getByRole('radio', { name: /Private Voice/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /General Voice/ })).not.toBeChecked();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders radio indicator and brand appearance hooks without changing the default DOM', () => {
    const options = [
      { value: 'GENERAL', label: 'General Voice' },
      { value: 'PRIVATE', label: 'Private Voice' },
    ];
    const { container: defaultRender } = render(
      <ChoiceCardGroup label="Jenis" options={options} />,
    );
    expect(defaultRender.querySelectorAll('.care-choice-card__indicator--radio')).toHaveLength(0);
    expect(
      defaultRender.querySelector('.care-choice-card__indicator')?.querySelector('svg'),
    ).not.toBeNull();

    const { container } = render(
      <ChoiceCardGroup
        label="Jenis"
        defaultValue="GENERAL"
        indicator="radio"
        appearance="brand"
        options={options}
      />,
    );
    expect(container.querySelector('.care-choice-card-group--brand')).not.toBeNull();
    const indicators = container.querySelectorAll('.care-choice-card__indicator--radio');
    expect(indicators).toHaveLength(2);
    expect(indicators[0]?.querySelector('svg')).toBeNull();
  });

  it('renders navigational and danger settings rows', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <SettingsGroup>
        <SettingsRow
          icon={<span>i</span>}
          title="Ganti password"
          description="Password baru 6–128 karakter"
          onClick={() => undefined}
        />
        <SettingsRow title="Keluar" tone="danger" onClick={onOpen} />
        <SettingsRow title="ID sesi" description="hanya diagnosis" />
      </SettingsGroup>,
    );
    await user.click(screen.getByRole('button', { name: 'Keluar' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Ganti password')).toBeInTheDocument();
  });

  it('renders key-value tiles on both surfaces', async () => {
    const { container } = render(
      <KeyValueGrid
        aria-label="Ringkasan akun"
        surface="brand"
        items={[
          { label: 'Status akun', value: 'Aktif', tone: 'success' },
          { label: 'Jenis akun', value: 'Karyawan' },
        ]}
      />,
    );
    expect(screen.getByLabelText('Ringkasan akun')).toBeInTheDocument();
    expect(screen.getByText('Status akun')).toBeInTheDocument();
    expect(container.querySelector('[data-tone="success"]')).toHaveTextContent('Aktif');
    expect(container.querySelector('.care-kv-grid--brand')).not.toBeNull();
  });

  it('toggles a disclosure row and exposes expanded semantics', async () => {
    const user = userEvent.setup();
    render(
      <DisclosureRow
        icon={<span>i</span>}
        title="Kemampuan akses"
        description="Diturunkan dari posisi struktural"
        defaultOpen={false}
      >
        <DotLabel tone="info">Member</DotLabel>
      </DisclosureRow>,
    );
    const trigger = screen.getByRole('button', { name: /Kemampuan akses/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Member')).not.toBeInTheDocument();
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: /Kemampuan akses/ })).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Member')).not.toBeInTheDocument();
  });

  it('defaults a disclosure row open when asked', () => {
    render(
      <DisclosureRow title="Timeline" description="3 pembaruan" defaultOpen>
        <p>Isi timeline</p>
      </DisclosureRow>,
    );
    expect(screen.getByRole('button', { name: /Timeline/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Isi timeline')).toBeInTheDocument();
  });

  it('selects a star rating through radio semantics and renders read-only summaries', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState<number | undefined>(undefined);
      return (
        <>
          <RatingInput label="Beri rating" value={value} onValueChange={setValue} />
          {value ? <RatingInput label="Rating terkirim" value={value} readOnly /> : null}
        </>
      );
    }
    const { container } = render(<Controlled />);
    expect(screen.getByRole('radiogroup', { name: 'Beri rating' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '4/5' }));
    expect(screen.getByRole('radio', { name: '4/5' })).toBeChecked();
    const summary = screen.getByRole('img', { name: 'Rating terkirim: 4/5' });
    expect(summary).toBeInTheDocument();
    expect(summary.querySelectorAll('svg[data-filled="true"]')).toHaveLength(4);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('keeps dot labels textual with a decorative dot', () => {
    const { container } = render(
      <main>
        <DotLabel tone="danger">High</DotLabel>
        <DotLabel>Netral</DotLabel>
      </main>,
    );
    const danger = container.querySelector('.care-dot-label[data-tone="danger"]');
    expect(danger).toHaveTextContent('High');
    expect(danger?.querySelector('i')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.care-dot-label[data-tone="neutral"]')).toHaveTextContent(
      'Netral',
    );
  });
});

describe('lightbox contracts', () => {
  const images = [
    { src: 'https://media.test/a.png', alt: 'Lampiran a' },
    { src: 'https://media.test/b.png', alt: 'Lampiran b' },
    { src: 'https://media.test/c.png', alt: 'Lampiran c' },
  ];

  function Viewer({ index, onIndexChange }: { index: number; onIndexChange: (i: number) => void }) {
    const [open, setOpen] = useState(false);
    return (
      <main>
        <Button onClick={() => setOpen(true)}>Buka galeri</Button>
        <Lightbox
          open={open}
          onOpenChange={setOpen}
          images={images}
          index={index}
          onIndexChange={onIndexChange}
        />
      </main>
    );
  }

  it('opens on the requested image, closes with Escape, and returns focus', async () => {
    const user = userEvent.setup();
    render(<Viewer index={1} onIndexChange={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Buka galeri' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    // First focusable control is the labelled back affordance.
    expect(screen.getByRole('button', { name: 'Kembali' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Buka galeri' })).toHaveFocus();
  });

  it('navigates with arrow keys and disables navigation at the ends', async () => {
    const user = userEvent.setup();
    function Host() {
      const [index, setIndex] = useState(0);
      return <Lightbox open images={images} index={index} onIndexChange={setIndex} />;
    }
    render(<Host />);
    const prev = screen.getByRole('button', { name: 'Gambar sebelumnya' });
    const next = screen.getByRole('button', { name: 'Gambar berikutnya' });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(next).toBeDisabled();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('jumps through thumbnails and marks the active one', async () => {
    const user = userEvent.setup();
    const onIndexChange = vi.fn();
    render(<Lightbox open images={images} index={1} onIndexChange={onIndexChange} />);
    const strip = screen.getByRole('group', { name: 'Pilih gambar' });
    expect(within(strip).getByRole('button', { name: 'Gambar 2' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await user.click(within(strip).getByRole('button', { name: 'Gambar 3' }));
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
  });

  it('renders an accessible, axe-clean viewer', async () => {
    render(<Lightbox open images={images} index={0} onIndexChange={() => undefined} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Gambar 1 dari 3');
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('renders nothing when closed or empty', () => {
    const { container } = render(
      <Lightbox open={false} images={images} index={0} onIndexChange={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
    const empty = render(<Lightbox open images={[]} index={0} onIndexChange={() => undefined} />);
    expect(empty.container).toBeEmptyDOMElement();
  });
});
