import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from './utils.js';

const buttonVariants = cva('care-button', {
  variants: {
    variant: {
      primary: 'care-button--primary',
      secondary: 'care-button--secondary',
      ghost: 'care-button--ghost',
      danger: 'care-button--danger',
    },
    size: {
      sm: 'care-button--sm',
      md: 'care-button--md',
      lg: 'care-button--lg',
      icon: 'care-button--icon',
    },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading = false, disabled, children, asChild = false, ...props },
  ref,
) {
  const content = (
    <>
      {loading ? <LoaderCircle className="care-button__loader" aria-hidden="true" /> : null}
      <span className="care-button__label">{children}</span>
    </>
  );
  if (asChild) {
    return (
      <Slot
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        aria-disabled={disabled || loading || undefined}
        aria-busy={loading || undefined}
        {...props}
      >
        {content}
      </Slot>
    );
  }
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {content}
    </button>
  );
});

export function IconButton({ 'aria-label': ariaLabel, children, ...props }: ButtonProps) {
  if (!ariaLabel) throw new Error('IconButton requires an aria-label.');
  return (
    <Button size="icon" aria-label={ariaLabel} {...props}>
      {children}
    </Button>
  );
}

export function Link({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cn('care-link', className)} {...props} />;
}

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article';
  variant?: 'default' | 'raised' | 'selected' | 'inset';
  interactive?: boolean;
}

export function Surface({
  as: Element = 'div',
  variant = 'default',
  interactive,
  className,
  ...props
}: SurfaceProps) {
  return (
    <Element
      className={cn(
        'care-surface',
        `care-surface--${variant}`,
        interactive && 'care-surface--interactive',
        className,
      )}
      {...props}
    />
  );
}

export const Card = Surface;
export const Panel = Surface;

export function Stack({
  gap = 'md',
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { gap?: 'xs' | 'sm' | 'md' | 'lg' }) {
  return (
    <div
      className={cn('care-stack', className)}
      style={{ '--stack-gap': `var(--space-${gap})`, ...style } as CSSProperties}
      {...props}
    />
  );
}

export function Grid({
  min = '16rem',
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { min?: string }) {
  return (
    <div
      className={cn('care-grid', className)}
      style={{ '--grid-min': min, ...style } as CSSProperties}
      {...props}
    />
  );
}

export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn('care-divider', className)} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="care-page-header">
      <div>
        {eyebrow ? <p className="care-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="care-page-header__actions">{actions}</div> : null}
    </header>
  );
}
