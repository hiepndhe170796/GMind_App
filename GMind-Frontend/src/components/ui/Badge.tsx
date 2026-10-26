import type { HTMLAttributes, ReactNode } from 'react';

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'violet';

const tones: Record<Tone, string> = {
  blue: 'bg-primary-50 text-primary-700',
  green: 'bg-success-50 text-success-700',
  amber: 'bg-warning-50 text-warning-700',
  red: 'bg-danger-50 text-danger-600',
  slate: 'bg-slate-100 text-slate-600',
  violet: 'bg-violet-50 text-violet-700',
};

const map: Record<string, Tone> = {
  ToDo: 'slate', InProgress: 'blue', Submitted: 'amber', ChangesRequested: 'red', Completed: 'green',
  Low: 'slate', Medium: 'blue', High: 'amber', Urgent: 'red',
  Leader: 'violet', Member: 'blue', Pending: 'amber', Approved: 'green', Rejected: 'red',
};

const variantMap: Record<string, Tone> = {
  primary: 'blue', secondary: 'slate', success: 'green', warning: 'amber', danger: 'red', neutral: 'slate',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  value?: string;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'neutral';
  children?: ReactNode;
}

export default function Badge({ value, variant, children, className = '', ...rest }: BadgeProps) {
  const tone = (value && map[value]) || (variant && variantMap[variant]) || 'slate';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`} {...rest}>
      {children ?? value}
    </span>
  );
}
