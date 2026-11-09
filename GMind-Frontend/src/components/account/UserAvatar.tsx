import { useState } from 'react';
import { isSafeAvatarUrl } from '../../utils/account-form';

export default function UserAvatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const safe = url && isSafeAvatarUrl(url) ? url : null;
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => Array.from(w)[0]?.toUpperCase() ?? '').join('') || '?';
  if (!safe || failedUrl === safe) {
    return (
      <span aria-hidden="true" className="flex shrink-0 items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>{initials}</span>
    );
  }
  return (
    <img src={safe} alt={`Ảnh đại diện của ${name}`} referrerPolicy="no-referrer"
      onError={() => setFailedUrl(safe)}
      className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  );
}
