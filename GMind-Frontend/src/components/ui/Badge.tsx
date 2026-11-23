import type { HTMLAttributes, ReactNode } from 'react';

type Tone = 'neutral' | 'blue' | 'violet' | 'warning' | 'success' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-line/60 text-ink-secondary',
  blue: 'bg-primary-50 text-primary-700',
  violet: 'bg-accent-50 text-accent-700',
  warning: 'bg-warning-50 text-warning-700',
  success: 'bg-success-50 text-success-700',
  danger: 'bg-danger-50 text-danger-700',
};

const map: Record<string, Tone> = {
  ToDo: 'neutral', InProgress: 'blue', Submitted: 'violet', ChangesRequested: 'warning', Completed: 'success',
  Low: 'neutral', Medium: 'blue', High: 'warning', Urgent: 'danger',
  Leader: 'violet', Member: 'neutral',
  Pending: 'violet', Approved: 'success', Rejected: 'danger', Cancelled: 'neutral',
};

const variantMap: Record<string, Tone> = {
  primary: 'blue', secondary: 'neutral', neutral: 'neutral', success: 'success',
  warning: 'warning', danger: 'danger', accent: 'violet',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  value?: string;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
  dot?: boolean;
  children?: ReactNode;
}

export default function Badge({ value, variant, dot = true, children, className = '', ...rest }: BadgeProps) {
  const tone = (value && map[value]) || (variant && variantMap[variant]) || 'neutral';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium whitespace-nowrap ${tones[tone]} ${className}`} {...rest}>
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children ?? value}
    </span>
  );
}
