import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined' | 'elevated';
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', variant = 'default', children, ...props }, ref) => {
    const hasPadding = /(^|\s)([a-z0-9]+:)?p[xytrbl]?-(\d|\[)/.test(className);
    const elevated = variant === 'elevated' ? ' shadow-raised' : '';
    return (
      <div ref={ref} className={`rounded-2xl bg-white border border-line${elevated}${hasPadding ? '' : ' p-4 sm:p-5'} ${className}`} {...props}>
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
export default Card;
