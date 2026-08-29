import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Check, ChevronRight } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Surface, type SurfaceProps } from './primitives.js';
import { cn } from './utils.js';

/**
 * Composed section patterns shared by workforce and Admin pages: a padded
 * card with a header slot (icon, title, description, action) and an optional
 * hairline divider above the body. Purely presentational; state stays with
 * accessible primitives (Radix radio, native button/anchor).
 */

type SurfacePadding = Exclude<SurfaceProps['padding'], undefined>;

export interface SectionCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode | undefined;
  icon?: ReactNode | undefined;
  action?: ReactNode | undefined;
  padding?: SurfacePadding | undefined;
  divided?: boolean | undefined;
  children: ReactNode;
}

export function SectionCard({
  title,
  description,
  icon,
  action,
  padding = 'md',
  divided = false,
  className,
  children,
  ...props
}: SectionCardProps) {
  return (
    <Surface
      padding={padding}
      className={cn('care-section-card', divided && 'care-section-card--divided', className)}
      {...props}
    >
      <div className="care-section-card__head">
        {icon ? (
          <span className="care-section-card__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="care-section-card__heading">
          <h3 className="care-section-card__title">{title}</h3>
          {description ? <p className="care-section-card__desc">{description}</p> : null}
        </div>
        {action ? <div className="care-section-card__action">{action}</div> : null}
      </div>
      <div className="care-section-card__body">{children}</div>
    </Surface>
  );
}

export interface ChoiceCardOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export function ChoiceCardGroup({
  label,
  value,
  defaultValue,
  onValueChange,
  options,
  columns = 1,
  variant = 'card',
  disabled,
  className,
}: {
  label: string;
  value?: string | undefined;
  defaultValue?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  options: ChoiceCardOption[];
  columns?: 1 | 2;
  /** `chip` renders the compact tile grid used for areas and categories. */
  variant?: 'card' | 'chip';
  disabled?: boolean | undefined;
  className?: string | undefined;
}) {
  const rootProps = {
    ...(value === undefined ? {} : { value }),
    ...(defaultValue === undefined ? {} : { defaultValue }),
    ...(onValueChange === undefined ? {} : { onValueChange }),
    ...(disabled === undefined ? {} : { disabled }),
  };
  return (
    <RadioGroupPrimitive.Root
      {...rootProps}
      aria-label={label}
      className={cn(
        'care-choice-card-group',
        columns === 2 && variant === 'card' && 'care-choice-card-group--2',
        variant === 'chip' && 'care-choice-card-group--chip',
        className,
      )}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={disabled || option.disabled}
          className={cn('care-choice-card', variant === 'chip' && 'care-choice-card--chip')}
        >
          {option.icon ? (
            <span className="care-choice-card__icon" aria-hidden="true">
              {option.icon}
            </span>
          ) : null}
          <span className="care-choice-card__text">
            <strong>{option.label}</strong>
            {option.description ? <small>{option.description}</small> : null}
          </span>
          <span className="care-choice-card__indicator" aria-hidden="true">
            <Check size={13} strokeWidth={3.5} />
          </span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

export function SettingsGroup({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('care-settings-group', className)} {...props}>
      {children}
    </div>
  );
}

export function SettingsRow({
  icon,
  title,
  description,
  trailing,
  onClick,
  href,
  tone = 'default',
  className,
}: {
  icon?: ReactNode | undefined;
  title: ReactNode;
  description?: ReactNode | undefined;
  /** Trailing control (switch, badge); defaults to a chevron for navigational rows. */
  trailing?: ReactNode | undefined;
  onClick?: (() => void) | undefined;
  href?: string | undefined;
  tone?: 'default' | 'danger' | undefined;
  className?: string | undefined;
}) {
  const rowClass = cn(
    'care-settings-row',
    tone === 'danger' && 'care-settings-row--danger',
    className,
  );
  const content = (
    <>
      {icon ? (
        <span className="care-settings-row__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="care-settings-row__text">
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      {trailing ??
        ((onClick || href) && (
          <ChevronRight size={18} className="care-settings-row__chevron" aria-hidden="true" />
        ))}
    </>
  );
  if (href) {
    return (
      <a className={rowClass} href={href} onClick={onClick}>
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={rowClass} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className={rowClass}>{content}</div>;
}

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
  tone?: 'default' | 'info' | 'success' | 'warning' | 'danger';
}

export function KeyValueGrid({
  items,
  columns = 2,
  surface = 'subtle',
  className,
  'aria-label': ariaLabel,
}: {
  items: KeyValueItem[];
  columns?: 1 | 2 | 3;
  surface?: 'subtle' | 'brand' | undefined;
  className?: string | undefined;
  'aria-label'?: string | undefined;
}) {
  return (
    <dl
      aria-label={ariaLabel}
      className={cn(
        'care-kv-grid',
        `care-kv-grid--${columns}`,
        surface === 'brand' && 'care-kv-grid--brand',
        className,
      )}
    >
      {items.map((item, index) => (
        <div className="care-kv" key={index}>
          <dt>{item.label}</dt>
          <dd {...(item.tone && item.tone !== 'default' ? { 'data-tone': item.tone } : {})}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
