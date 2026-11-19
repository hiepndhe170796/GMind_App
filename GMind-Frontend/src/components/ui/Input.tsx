import type { InputHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';
import Icon from './Icon';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, hint, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;
    const describedBy = props['aria-describedby'];
    const invalid = props['aria-invalid'];
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    const descriptions = [describedBy, hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-small font-semibold text-ink-secondary">
            {label}
          </label>
        )}
        <input
          {...props}
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : invalid}
          aria-describedby={descriptions}
          className={`w-full px-3.5 bg-white text-ink ${className}`}
        />
        {hint && (
          <p id={hintId} className="mt-1.5 text-small text-ink-muted">{hint}</p>
        )}
        {error && (
          <p id={errorId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-small text-danger-700">
            <Icon name="alert" size={15} className="mt-0.5 shrink-0" />{error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
