import * as AccordionPrimitive from '@radix-ui/react-accordion';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { type ReactNode } from 'react';
import { springTokens } from './tokens.js';
import { IconButton } from './primitives.js';
import { cn, useControllableState } from './utils.js';

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  items,
  label,
}: {
  value?: string;
  defaultValue: string;
  onValueChange?: (value: string) => void;
  items: { value: string; label: string; content: ReactNode; disabled?: boolean }[];
  label: string;
}) {
  const reduce = useReducedMotion();
  const rootProps = {
    ...(value === undefined ? {} : { value }),
    ...(onValueChange === undefined ? {} : { onValueChange }),
  };
  return (
    <TabsPrimitive.Root {...rootProps} defaultValue={defaultValue} className="care-tabs">
      <TabsPrimitive.List aria-label={label} className="care-tabs__list">
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            {...(item.disabled === undefined ? {} : { disabled: item.disabled })}
            className="care-tabs__trigger"
          >
            {item.label}
            <motion.span
              className="care-tabs__indicator"
              layoutId={`tab-${label}`}
              transition={reduce ? { duration: 0 } : springTokens.layout}
            />
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content key={item.value} value={item.value} className="care-tabs__content">
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}

export function Accordion({
  items,
  type = 'single',
  defaultValue,
}: {
  items: { id: string; title: string; content: ReactNode; disabled?: boolean }[];
  type?: 'single';
  defaultValue?: string;
}) {
  return (
    <AccordionPrimitive.Root
      className="care-accordion"
      type={type}
      {...(defaultValue === undefined ? {} : { defaultValue })}
      collapsible
    >
      {items.map((item) => (
        <AccordionPrimitive.Item
          value={item.id}
          key={item.id}
          {...(item.disabled === undefined ? {} : { disabled: item.disabled })}
        >
          <AccordionPrimitive.Header>
            <AccordionPrimitive.Trigger>
              {item.title}
              <ChevronDown className="care-accordion__chevron" size={18} />
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content>
            <div>{item.content}</div>
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}

export function BottomNav({
  items,
  current,
  onNavigate,
  label = 'Navigasi utama',
}: {
  items: { id: string; label: string; icon: ReactNode; disabled?: boolean }[];
  current: string;
  onNavigate?: (id: string) => void;
  label?: string;
}) {
  return (
    <nav className="care-bottom-nav" aria-label={label}>
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          aria-current={current === item.id ? 'page' : undefined}
          disabled={item.disabled}
          onClick={() => onNavigate?.(item.id)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function Sidebar({
  items,
  current,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  onNavigate,
  header,
  footer,
  label = 'Navigasi aplikasi',
}: {
  items: { id: string; label: string; icon: ReactNode; disabled?: boolean }[];
  current: string;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onNavigate?: (id: string) => void;
  header?: ReactNode;
  footer?: ReactNode;
  label?: string;
}) {
  const [isCollapsed, setCollapsed] = useControllableState({
    value: collapsed,
    defaultValue: defaultCollapsed,
    onChange: onCollapsedChange,
  });
  return (
    <aside className={cn('care-sidebar', isCollapsed && 'is-collapsed')}>
      <div className="care-sidebar__header">
        {header}
        <IconButton
          variant="ghost"
          aria-label={isCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          onClick={() => setCollapsed(!isCollapsed)}
        >
          {isCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
        </IconButton>
      </div>
      <nav aria-label={label}>
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-current={current === item.id ? 'page' : undefined}
            disabled={item.disabled}
            title={isCollapsed ? item.label : undefined}
            onClick={() => onNavigate?.(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {footer ? <div className="care-sidebar__footer">{footer}</div> : null}
    </aside>
  );
}

export function Breadcrumbs({
  items,
  label = 'Breadcrumb',
}: {
  items: { label: string; href?: string }[];
  label?: string;
}) {
  return (
    <nav aria-label={label} className="care-breadcrumbs">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href && index < items.length - 1 ? (
              <a href={item.href}>{item.label}</a>
            ) : (
              <span aria-current={index === items.length - 1 ? 'page' : undefined}>
                {item.label}
              </span>
            )}
            {index < items.length - 1 ? <ChevronRight size={14} aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  disabled,
  label = 'Pagination',
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
  return (
    <nav className="care-pagination" aria-label={label}>
      <IconButton
        variant="secondary"
        aria-label="Halaman sebelumnya"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft size={18} />
      </IconButton>
      {pages.map((value) => (
        <button
          type="button"
          key={value}
          aria-current={page === value ? 'page' : undefined}
          disabled={disabled}
          onClick={() => onPageChange(value)}
        >
          {value}
        </button>
      ))}
      <IconButton
        variant="secondary"
        aria-label="Halaman berikutnya"
        disabled={disabled || page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight size={18} />
      </IconButton>
    </nav>
  );
}
