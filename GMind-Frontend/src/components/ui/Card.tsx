import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined' | 'elevated';
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', variant = 'default', children, ...props }, ref) => {
    const variantStyles = {
      default: 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800',
      outlined: 'bg-transparent border-2 border-neutral-300 dark:border-neutral-700',
      elevated: 'bg-white dark:bg-neutral-900 shadow-lg',
    };

    return (
      <div
        ref={ref}
        className={`rounded-xl p-6 ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export default Card;
