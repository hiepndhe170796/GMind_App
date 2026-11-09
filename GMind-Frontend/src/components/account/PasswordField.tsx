import { useState } from 'react';
import Input from '../ui/Input';
import Icon from '../ui/Icon';

export default function PasswordField({ id, label, value, onChange, error, hint, disabled, current = false }: {
  id: string; label: string; value: string; onChange(value: string): void;
  error?: string; hint?: string; disabled: boolean; current?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name={id} label={label} value={value} onChange={e => onChange(e.target.value)}
        type={show ? 'text' : 'password'} autoComplete={current ? 'current-password' : 'new-password'}
        required disabled={disabled} error={error} hint={hint} className="pr-14"
        spellCheck={false} autoCapitalize="none" autoCorrect="off" />
      <button type="button" disabled={disabled} aria-pressed={show} aria-controls={id}
        aria-label={`${show ? 'Ẩn' : 'Hiện'} ${label.toLowerCase()}`} onClick={() => setShow(v => !v)}
        className="absolute right-1 top-6 flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">
        <Icon name={show ? 'eye-off' : 'eye'} size={20} />
      </button>
    </div>
  );
}
