import type { ButtonHTMLAttributes } from 'react';
import { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700',
  secondary: 'bg-white text-ink border border-line-strong hover:bg-surface-subtle',
  ghost: 'text-primary-700 hover:bg-primary-50',
  accent: 'bg-accent-600 text-white hover:bg-accent-700',
  danger: 'bg-white text-danger-700 border border-danger-100 hover:bg-danger-50',
};
const sizeStyles: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
};
const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[color,background-color,border-color,transform] duration-150 ease-out active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0';

// eslint-disable-next-line react/only-export-components -- shared by Button and Link-as-button call sites
export function buttonClasses({ variant = 'primary', size = 'md', className = '' }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', isLoading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={buttonClasses({ variant, size, className })}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Đang xử lý…
          </>
        ) : children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
