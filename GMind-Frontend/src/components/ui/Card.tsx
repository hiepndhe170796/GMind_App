import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined' | 'elevated';
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', variant = 'default', children, ...props }, ref) => {
    const variantStyles = {
      default: 'bg-white border border-[#e7ecf4]',
      outlined: 'bg-white border border-[#e7ecf4]',
      elevated: 'bg-white border border-[#e7ecf4] shadow-card',
    };
    return (
      <div ref={ref} className={`rounded-2xl p-6 ${variantStyles[variant]} ${className}`} {...props}>
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
export default Card;
