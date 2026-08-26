import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import { type ReactNode } from 'react';
import { choreographyTokens } from './tokens.js';
import { Button } from './primitives.js';
import { cn } from './utils.js';

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={choreographyTokens.tooltipDelay}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className="care-tooltip" side={side} sideOffset={8}>
            {content}
            <TooltipPrimitive.Arrow className="care-tooltip__arrow" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function Popover({
  trigger,
  children,
  open,
  defaultOpen,
  onOpenChange,
  label = 'Panel informasi',
}: {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string;
}) {
  const rootProps = {
    ...(open === undefined ? {} : { open }),
    ...(defaultOpen === undefined ? {} : { defaultOpen }),
    ...(onOpenChange === undefined ? {} : { onOpenChange }),
  };
  return (
    <PopoverPrimitive.Root {...rootProps}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className="care-popover" sideOffset={8} aria-label={label}>
          <PopoverPrimitive.Arrow className="care-popover__arrow" />
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function Menu({
  trigger,
  items,
  open,
  defaultOpen,
  onOpenChange,
  label = 'Menu tindakan',
}: {
  trigger: ReactNode;
  items: {
    id: string;
    label: string;
    icon?: ReactNode;
    disabled?: boolean;
    danger?: boolean;
    onSelect: () => void;
  }[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string;
}) {
  return (
    <Popover
      trigger={trigger}
      {...(open === undefined ? {} : { open })}
      {...(defaultOpen === undefined ? {} : { defaultOpen })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      label={label}
    >
      <div className="care-menu" role="menu" aria-label={label}>
        {items.map((item) => (
          <button
            type="button"
            role="menuitem"
            key={item.id}
            disabled={item.disabled}
            data-danger={item.danger || undefined}
            onClick={item.onSelect}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </Popover>
  );
}

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  mobileSheet?: boolean;
  drawerSide?: 'left' | 'right';
}
export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  size = 'md',
  mobileSheet,
  drawerSide,
}: DialogProps) {
  const rootProps = {
    ...(open === undefined ? {} : { open }),
    ...(defaultOpen === undefined ? {} : { defaultOpen }),
    ...(onOpenChange === undefined ? {} : { onOpenChange }),
  };
  return (
    <DialogPrimitive.Root {...rootProps}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="care-dialog__overlay" />
        <DialogPrimitive.Content
          className={cn(
            'care-dialog',
            `care-dialog--${size}`,
            mobileSheet && 'care-dialog--mobile-sheet',
            drawerSide && `care-dialog--drawer-${drawerSide}`,
          )}
        >
          <div className="care-dialog__header">
            <div>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description>{description}</DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close className="care-icon-dismiss" aria-label="Tutup dialog">
              <X size={19} />
            </DialogPrimitive.Close>
          </div>
          <div className="care-dialog__body">{children}</div>
          {footer ? <div className="care-dialog__footer">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  destructive,
  loading,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      trigger={trigger}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <DialogPrimitive.Close asChild>
            <Button variant="secondary">{cancelLabel}</Button>
          </DialogPrimitive.Close>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            {...(loading === undefined ? {} : { loading })}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      Pastikan informasi dan konsekuensi tindakan sudah diperiksa.
    </Dialog>
  );
}

export function Drawer({ side = 'right', ...props }: DialogProps & { side?: 'left' | 'right' }) {
  return <Dialog {...props} size="lg" mobileSheet={false} drawerSide={side} />;
}

export function BottomSheet(props: DialogProps) {
  return <Dialog {...props} mobileSheet />;
}
