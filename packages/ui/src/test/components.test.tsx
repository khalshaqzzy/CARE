import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { Button } from '../primitives.js';
import { Checkbox, Combobox, Input, SegmentedControl } from '../forms.js';
import { Dialog } from '../overlays.js';

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
