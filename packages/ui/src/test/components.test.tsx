import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { vi } from 'vitest';
import { Button } from '../primitives.js';
import { Checkbox, Combobox, Input, SegmentedControl } from '../forms.js';
import { Dialog } from '../overlays.js';
import {
  ChoiceCardGroup,
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
});
