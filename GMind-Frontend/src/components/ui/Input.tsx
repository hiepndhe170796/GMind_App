import type { InputHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';

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
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1">
            {label}
          </label>
        )}
        <input
          {...props}
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : invalid}
          aria-describedby={descriptions}
          className={`w-full px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${error ? 'border-danger-500 focus:ring-danger-500' : ''} ${className}`}
        />
        {hint && (
          <p id={hintId} className="mt-2 text-sm text-slate-600">{hint}</p>
        )}
        {error && (
          <p id={errorId} role="alert" className="mt-2 text-sm text-danger-700">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
