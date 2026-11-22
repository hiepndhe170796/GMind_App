// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFileObjectUrl } from './hooks/use-file-object-url';
import { filesService } from './services/files';
import { prepareAvatar } from './utils/avatar-image';
import { notificationTarget, typeIcon, typeTone } from './services/notifications';
import UserAvatar from './components/account/UserAvatar';
import { saveSession, clearSession, type AuthResult } from './services/session';

const SESSION: AuthResult = {
  accessToken: 't', refreshToken: 'r', expiresAt: '2100-01-01',
  user: { id: 'u0', displayName: 'T', email: 'x@x.dev', avatarUrl: null },
};
beforeEach(() => { saveSession(SESSION); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

describe('useFileObjectUrl under StrictMode', () => {
  it('keeps the rendered url alive after mount and revokes on unmount', async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    let n = 0;
    URL.createObjectURL = vi.fn(() => { const u = `blob:mock-${++n}`; created.push(u); return u; });
    URL.revokeObjectURL = vi.fn((u: string) => { revoked.push(u); });
    vi.spyOn(filesService, 'fetchFileBlob').mockResolvedValue(new Blob(['x']));

    const Probe = () => {
      const { url } = useFileObjectUrl('f-1');
      return <img src={url ?? ''} alt="thumb" />;
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <StrictMode><QueryClientProvider client={client}><Probe /></QueryClientProvider></StrictMode>);

    const img = await screen.findByRole('img');
    await waitFor(() => expect(img.getAttribute('src')).toMatch(/^blob:mock-/));
    const live = img.getAttribute('src')!;
    expect(revoked).not.toContain(live);           // StrictMode remount did not kill the live URL
    unmount();
    expect(revoked).toContain(live);               // revoked on unmount
  });
});

describe('prepareAvatar', () => {
  const mockCanvas = (toBlobImpl: (cb: (b: Blob | null) => void, type?: string) => void) => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlobImpl as never);
    return drawImage;
  };
  const png = (size = 100) => new File([new Uint8Array(size)], 'a.png', { type: 'image/png' });

  it('center-crops to a 256 square and prefers webp', async () => {
    const drawImage = mockCanvas((cb, type) => cb(new Blob(['x'], { type: type ?? 'image/webp' })));
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })));
    const out = await prepareAvatar(png());
    expect(out.type).toBe('image/webp');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 600, 600, 0, 0, 256, 256);
  });

  it('falls back to PNG when webp is unavailable', async () => {
    mockCanvas((cb, type) => cb(type === 'image/webp' ? null : new Blob(['x'], { type: 'image/png' })));
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })));
    const out = await prepareAvatar(png());
    expect(out.type).toBe('image/png');
  });

  it('rejects wrong types and oversized input', async () => {
    await expect(prepareAvatar(new File(['x'], 'a.gif', { type: 'image/gif' })))
      .rejects.toThrow('Ảnh đại diện chỉ nhận PNG, JPEG hoặc WebP.');
    await expect(prepareAvatar(new File([new Uint8Array(11 * 1024 * 1024)], 'a.png', { type: 'image/png' })))
      .rejects.toThrow('Ảnh gốc vượt quá 10 MB.');
  });

  it('rejects undecodable images with the VN decode message', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('bad'); }));
    vi.stubGlobal('Image', class {
      onerror: (() => void) | null = null; onload: (() => void) | null = null;
      set src(_v: string) { this.onerror?.(); }
    });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    await expect(prepareAvatar(png())).rejects.toThrow('Không đọc được ảnh này');
  });
});

describe('discussion notifications 28/29', () => {
  const pid = '11111111-1111-1111-1111-111111111111';
  const n = (type: string) => ({
    id: 'n', type, title: 't', body: 'b', createdAt: 'x', isRead: false,
    relatedEntityType: 'Project', relatedEntityId: pid, groupId: null,
  });
  it('maps icon, tone and target', () => {
    for (const t of ['MentionedInDiscussion', 'DiscussionReply']) {
      expect(typeIcon(t)).toBe('chat');
      expect(typeTone(t)).toBe('text-accent-700');
      expect(notificationTarget(n(t) as never)).toEqual({
        href: `/projects/${pid}?tab=discussion`, label: 'Mở thảo luận' });
    }
  });
});

describe('UserAvatar', () => {
  it('prefixes relative /api/avatars paths with the API base', () => {
    render(<UserAvatar name="An Bình" url="/api/avatars/00000000-0000-0000-0000-000000000001" />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.src).toContain('/api/avatars/00000000-0000-0000-0000-000000000001');
    expect(img.src.startsWith('http')).toBe(true);
  });
});
