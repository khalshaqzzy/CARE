import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, ChevronDown, Eye, EyeOff, Search, Star, Upload, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  forwardRef,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { springTokens } from './tokens.js';
import { cn, useControllableState } from './utils.js';

export function Field({
  label,
  helperText,
  errorText,
  required,
  htmlFor,
  counter,
  hideLabel = false,
  children,
}: {
  label: string;
  helperText?: string | undefined;
  errorText?: string | undefined;
  required?: boolean | undefined;
  htmlFor: string;
  /** Optional right-aligned counter (e.g. "12/150") rendered beside the label. */
  counter?: string | undefined;
  /** Keeps the label for assistive technology while rendering it invisibly. */
  hideLabel?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <div className="care-field" data-invalid={Boolean(errorText) || undefined}>
      <div className="care-field__labelrow">
        <label className={cn('care-field__label', hideLabel && 'care-sr-only')} htmlFor={htmlFor}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </label>
        {counter ? <span className="care-field__counter">{counter}</span> : null}
      </div>
      {children}
      {errorText ? (
        <p className="care-field__error" id={`${htmlFor}-error`} role="alert">
          {errorText}
        </p>
      ) : helperText ? (
        <p className="care-field__helper" id={`${htmlFor}-helper`}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  errorText?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  counter?: string;
  /** Keeps the label for assistive technology while rendering it invisibly. */
  hideLabel?: boolean;
}
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id: suppliedId,
    label,
    helperText,
    errorText,
    leading,
    trailing,
    counter,
    hideLabel,
    className,
    required,
    ...props
  },
  ref,
) {
  const generated = useId();
  const id = suppliedId ?? generated;
  return (
    <Field
      label={label}
      helperText={helperText}
      errorText={errorText}
      required={required}
      htmlFor={id}
      counter={counter}
      hideLabel={hideLabel}
    >
      <div className="care-input-shell">
        {leading ? (
          <span className="care-input-shell__icon" aria-hidden="true">
            {leading}
          </span>
        ) : null}
        <input
          ref={ref}
          id={id}
          className={cn('care-input', className)}
          required={required}
          aria-invalid={Boolean(errorText) || undefined}
          aria-describedby={errorText ? `${id}-error` : helperText ? `${id}-helper` : undefined}
          {...props}
        />
        {trailing ? (
          <span className="care-input-shell__icon" aria-hidden="true">
            {trailing}
          </span>
        ) : null}
      </div>
    </Field>
  );
});

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  helperText?: string;
  errorText?: string;
  leading?: ReactNode;
  counter?: string;
}
/**
 * Password field with an accessible visibility toggle. The shared `Input`
 * renders trailing content as an aria-hidden span, so the toggle needs its own
 * real button to stay operable and labelled.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    {
      id: suppliedId,
      label,
      helperText,
      errorText,
      leading,
      counter,
      className,
      required,
      ...props
    },
    ref,
  ) {
    const generated = useId();
    const id = suppliedId ?? generated;
    const [visible, setVisible] = useState(false);
    return (
      <Field
        label={label}
        helperText={helperText}
        errorText={errorText}
        required={required}
        htmlFor={id}
        counter={counter}
      >
        <div className="care-input-shell care-password-input">
          {leading ? (
            <span className="care-input-shell__icon" aria-hidden="true">
              {leading}
            </span>
          ) : null}
          <input
            ref={ref}
            id={id}
            type={visible ? 'text' : 'password'}
            className={cn('care-input', className)}
            required={required}
            aria-invalid={Boolean(errorText) || undefined}
            aria-describedby={errorText ? `${id}-error` : helperText ? `${id}-helper` : undefined}
            {...props}
          />
          <button
            type="button"
            className="care-password-input__toggle"
            aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'}
            aria-pressed={visible}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </Field>
    );
  },
);

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helperText?: string;
  errorText?: string;
  counter?: string;
  /** Keeps the label for assistive technology while rendering it invisibly. */
  hideLabel?: boolean;
}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    id: suppliedId,
    label,
    helperText,
    errorText,
    counter,
    hideLabel,
    className,
    required,
    ...props
  },
  ref,
) {
  const generated = useId();
  const id = suppliedId ?? generated;
  return (
    <Field
      label={label}
      helperText={helperText}
      errorText={errorText}
      required={required}
      htmlFor={id}
      counter={counter}
      hideLabel={hideLabel}
    >
      <textarea
        ref={ref}
        id={id}
        className={cn('care-textarea', className)}
        required={required}
        aria-invalid={Boolean(errorText) || undefined}
        aria-describedby={errorText ? `${id}-error` : helperText ? `${id}-helper` : undefined}
        {...props}
      />
    </Field>
  );
});

export function NativeSelect({
  label,
  helperText,
  errorText,
  id: suppliedId,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  helperText?: string;
  errorText?: string;
}) {
  const generated = useId();
  const id = suppliedId ?? generated;
  return (
    <Field label={label} helperText={helperText} errorText={errorText} htmlFor={id}>
      <select
        id={id}
        className="care-native-select"
        aria-invalid={Boolean(errorText) || undefined}
        aria-describedby={errorText ? `${id}-error` : helperText ? `${id}-helper` : undefined}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}

export function Select({
  label,
  value,
  defaultValue,
  onValueChange,
  options,
  disabled,
  helperText,
  errorText,
  leading,
  placeholder = 'Pilih opsi',
  hideLabel = false,
}: {
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
  helperText?: string;
  errorText?: string;
  /** Optional icon rendered before the selected value inside the trigger. */
  leading?: ReactNode;
  placeholder?: string;
  /** Hides the visible label for compact filter-pill layouts (still labeled). */
  hideLabel?: boolean;
}) {
  const id = useId();
  const rootProps = {
    ...(value === undefined ? {} : { value }),
    ...(defaultValue === undefined ? {} : { defaultValue }),
    ...(onValueChange === undefined ? {} : { onValueChange }),
    ...(disabled === undefined ? {} : { disabled }),
  };
  return (
    <Field
      label={label}
      helperText={helperText}
      errorText={errorText}
      htmlFor={id}
      hideLabel={hideLabel}
    >
      <SelectPrimitive.Root {...rootProps}>
        <SelectPrimitive.Trigger
          id={id}
          className="care-select-trigger"
          aria-invalid={Boolean(errorText) || undefined}
          aria-describedby={errorText ? `${id}-error` : helperText ? `${id}-helper` : undefined}
        >
          {leading ? (
            <span className="care-select-trigger__icon" aria-hidden="true">
              {leading}
            </span>
          ) : null}
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown size={18} />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content className="care-select-content" position="popper">
            <SelectPrimitive.Viewport>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  {...(option.disabled === undefined ? {} : { disabled: option.disabled })}
                  className="care-select-item"
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator>
                    <Check size={16} />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </Field>
  );
}

export function Combobox({
  label,
  options,
  value,
  defaultValue = '',
  onValueChange,
  disabled,
  emptyText = 'Tidak ada hasil.',
}: {
  label: string;
  options: { value: string; label: string }[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  emptyText?: string;
}) {
  const [current, setCurrent] = useControllableState({
    value,
    defaultValue,
    onChange: onValueChange,
  });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(
    () =>
      options.filter((option) =>
        option.label.toLocaleLowerCase('id-ID').includes(query.toLocaleLowerCase('id-ID')),
      ),
    [options, query],
  );
  const choose = (index: number) => {
    const option = filtered[index];
    if (option) {
      setCurrent(option.value);
      setOpen(false);
      setQuery('');
    }
  };
  return (
    <div className="care-field">
      <span className="care-field__label">{label}</span>
      <div className="care-combobox">
        <button
          type="button"
          className="care-select-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => {
            setOpen((next) => !next);
            setActiveIndex(0);
            queueMicrotask(() => inputRef.current?.focus());
          }}
        >
          {options.find((option) => option.value === current)?.label ?? 'Pilih opsi'}
          <ChevronDown size={18} />
        </button>
        <AnimatePresence>
          {open ? (
            <motion.div
              className="care-combobox__panel"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={springTokens.panel}
            >
              <div className="care-combobox__search">
                <Search size={16} aria-hidden="true" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  aria-label={`Cari ${label}`}
                  aria-activedescendant={
                    filtered[activeIndex] ? `${label}-${filtered[activeIndex]?.value}` : undefined
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setOpen(false);
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setActiveIndex((index) => Math.min(filtered.length - 1, index + 1));
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setActiveIndex((index) => Math.max(0, index - 1));
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      choose(activeIndex);
                    }
                  }}
                />
              </div>
              <div role="listbox" aria-label={label}>
                {filtered.length ? (
                  filtered.map((option, index) => (
                    <button
                      id={`${label}-${option.value}`}
                      type="button"
                      role="option"
                      aria-selected={current === option.value}
                      data-active={activeIndex === index || undefined}
                      className="care-combobox__option"
                      key={option.value}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(index)}
                    >
                      {option.label}
                      {current === option.value ? <Check size={16} /> : null}
                    </button>
                  ))
                ) : (
                  <p className="care-combobox__empty">{emptyText}</p>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function Checkbox({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  description,
  disabled,
  indeterminate,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  indeterminate?: boolean;
}) {
  const [current, setCurrent] = useControllableState({
    value: checked,
    defaultValue: defaultChecked,
    onChange: onCheckedChange,
  });
  return (
    <label className="care-choice">
      <CheckboxPrimitive.Root
        checked={indeterminate ? 'indeterminate' : current}
        onCheckedChange={(next) => setCurrent(next === true)}
        disabled={disabled}
        className="care-checkbox"
      >
        <CheckboxPrimitive.Indicator>
          <Check size={15} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}

export function RadioGroup({
  value,
  defaultValue,
  onValueChange,
  label,
  options,
  disabled,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  label: string;
  options: { value: string; label: string; description?: string; disabled?: boolean }[];
  disabled?: boolean;
}) {
  const rootProps = {
    ...(value === undefined ? {} : { value }),
    ...(defaultValue === undefined ? {} : { defaultValue }),
    ...(onValueChange === undefined ? {} : { onValueChange }),
    ...(disabled === undefined ? {} : { disabled }),
  };
  return (
    <RadioGroupPrimitive.Root {...rootProps} aria-label={label} className="care-radio-group">
      {options.map((option) => (
        <label className="care-choice" key={option.value}>
          <RadioGroupPrimitive.Item
            value={option.value}
            {...(option.disabled === undefined ? {} : { disabled: option.disabled })}
            className="care-radio"
          >
            <RadioGroupPrimitive.Indicator className="care-radio__indicator" />
          </RadioGroupPrimitive.Item>
          <span>
            <strong>{option.label}</strong>
            {option.description ? <small>{option.description}</small> : null}
          </span>
        </label>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

/**
 * Star rating on radio semantics (1–5). The accessible value is "n/5"; the
 * stars are decorative. `readOnly` renders a non-interactive summary, e.g. a
 * submitted closure-cycle rating.
 */
export function RatingInput({
  label,
  value,
  defaultValue,
  onValueChange,
  disabled,
  readOnly = false,
  className,
}: {
  label: string;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string | undefined;
}) {
  const stars = [1, 2, 3, 4, 5];
  if (readOnly) {
    const score = value ?? 0;
    return (
      <span
        className={cn('care-rating is-readonly', className)}
        role="img"
        aria-label={`${label}: ${score}/5`}
      >
        {stars.map((star) => (
          <Star key={star} aria-hidden="true" data-filled={star <= score || undefined} />
        ))}
        <span className="care-rating__value">{score}/5</span>
      </span>
    );
  }
  const rootProps = {
    ...(value === undefined ? {} : { value: String(value) }),
    ...(defaultValue === undefined ? {} : { defaultValue: String(defaultValue) }),
    ...(onValueChange === undefined
      ? {}
      : { onValueChange: (v: string) => onValueChange?.(Number(v)) }),
    ...(disabled === undefined ? {} : { disabled }),
  };
  return (
    <RadioGroupPrimitive.Root
      {...rootProps}
      aria-label={label}
      className={cn('care-rating', className)}
    >
      {stars.map((score) => (
        <RadioGroupPrimitive.Item
          key={score}
          value={String(score)}
          aria-label={`${score}/5`}
          className="care-rating__star"
        >
          <Star aria-hidden="true" />
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

export function Switch({
  checked,
  defaultChecked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const rootProps = {
    ...(checked === undefined ? {} : { checked }),
    ...(defaultChecked === undefined ? {} : { defaultChecked }),
    ...(onCheckedChange === undefined ? {} : { onCheckedChange }),
    ...(disabled === undefined ? {} : { disabled }),
  };
  return (
    <label className="care-switch-row">
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <SwitchPrimitive.Root {...rootProps} className="care-switch">
        <SwitchPrimitive.Thumb className="care-switch__thumb" />
      </SwitchPrimitive.Root>
    </label>
  );
}

export function SegmentedControl({
  value,
  defaultValue,
  onValueChange,
  label,
  items,
  disabled,
}: {
  value?: string;
  defaultValue: string;
  onValueChange?: (value: string) => void;
  label: string;
  items: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
}) {
  const reduce = useReducedMotion();
  const [current, setCurrent] = useControllableState({
    value,
    defaultValue,
    onChange: onValueChange,
  });
  return (
    <div className="care-segmented" role="radiogroup" aria-label={label}>
      {items.map((item) => (
        <button
          type="button"
          role="radio"
          aria-checked={current === item.value}
          disabled={disabled || item.disabled}
          key={item.value}
          onClick={() => setCurrent(item.value)}
        >
          {current === item.value ? (
            <motion.span
              className="care-segmented__indicator"
              layoutId={`segment-${label}`}
              transition={reduce ? { duration: 0 } : springTokens.layout}
            />
          ) : null}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export type UploadItem = {
  id: string;
  name: string;
  progress?: number;
  status?: 'queued' | 'uploading' | 'success' | 'error';
  error?: string;
};
export function FileUpload({
  label,
  accept,
  multiple,
  maxFiles = 5,
  disabled,
  items = [],
  onFilesAdded,
  onRemove,
  onRetry,
}: {
  label: string;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  disabled?: boolean;
  items?: UploadItem[];
  onFilesAdded: (files: File[]) => void;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
}) {
  const inputId = useId();
  const maxReached = items.length >= maxFiles;
  return (
    <div className="care-upload">
      <input
        id={inputId}
        className="care-sr-only"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled || maxReached}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])].slice(
            0,
            Math.max(0, maxFiles - items.length),
          );
          if (files.length) onFilesAdded(files);
          event.target.value = '';
        }}
      />
      <label
        htmlFor={inputId}
        className={cn('care-upload__dropzone', (disabled || maxReached) && 'is-disabled')}
      >
        <Upload size={22} aria-hidden="true" />
        <strong>{label}</strong>
        <span>{maxReached ? `Batas ${maxFiles} file tercapai` : 'Pilih file dari perangkat'}</span>
      </label>
      {items.length ? (
        <ul className="care-upload__list">
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <small>{item.error ?? item.status ?? 'queued'}</small>
                {item.status === 'uploading' ? (
                  <progress
                    value={item.progress ?? 0}
                    max={100}
                    aria-label={`Progres ${item.name}`}
                  />
                ) : null}
              </div>
              <span>
                {item.status === 'error' && onRetry ? (
                  <button type="button" onClick={() => onRetry(item.id)}>
                    Coba lagi
                  </button>
                ) : null}
                {onRemove ? (
                  <button
                    type="button"
                    aria-label={`Hapus ${item.name}`}
                    onClick={() => onRemove(item.id)}
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export const MediaUpload = FileUpload;
