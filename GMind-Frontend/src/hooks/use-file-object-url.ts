import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { filesService } from '../services/files';
import { qk } from '../services/query-keys';
import { getSessionSnapshot } from '../services/session';

const uid = () => getSessionSnapshot()?.user.id ?? '';

/** Authenticated thumbnail: blob fetched once, object URL revoked on change/unmount. */
export function useFileObjectUrl(fileId: string | null): { url: string | null; isError: boolean } {
  const q = useQuery({
    queryKey: qk.fileBlob(uid(), fileId ?? ''),
    queryFn: () => filesService.fetchFileBlob(fileId!),
    enabled: !!fileId,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });
  const [url, setUrl] = useState<string | null>(null);
  const blob = q.data ?? null;
  // Object URL lives in state: created inside the effect so StrictMode's
  // mount → cleanup → remount recreates it instead of revoking a memoized URL.
  /* eslint-disable react/set-state-in-effect -- spec: the object URL is created inside
     the effect so StrictMode's remount revives it instead of revoking a memoized one. */
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => { URL.revokeObjectURL(u); setUrl(null); };
  }, [blob]);
  /* eslint-enable react/set-state-in-effect */
  return { url, isError: q.isError };
}
