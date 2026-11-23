import { useEffect } from 'react';

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    if (title === undefined) return;
    document.title = title ? `${title} · GMind` : 'GMind';
  }, [title]);
}
