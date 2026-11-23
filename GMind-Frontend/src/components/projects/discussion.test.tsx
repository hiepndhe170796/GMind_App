// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../ui/Toast';
import DiscussionComposer, { type ComposerMember } from './DiscussionComposer';
import ProjectDiscussion from './ProjectDiscussion';
import { discussionService, type MessageDto, type MessagePageDto } from '../../services/discussion';
import { qk } from '../../services/query-keys';
import { saveSession, clearSession, type AuthResult } from '../../services/session';

const MEMBERS: ComposerMember[] = [
  { userId: 'u1', displayName: 'An Bình' },
  { userId: 'u2', displayName: 'Bảo Châu' },
];
const SESSION: AuthResult = {
  accessToken: 't', refreshToken: 'r', expiresAt: '2100-01-01',
  user: { id: 'u0', displayName: 'Tôi', email: 't@x.dev', avatarUrl: null },
};
const msg = (over: Partial<MessageDto> = {}): MessageDto => ({
  id: 'm1', projectId: 'p1', authorUserId: 'u1', authorName: 'An Bình', authorAvatarUrl: null,
  body: 'xin chào', createdAt: '2026-01-01T10:00:00Z', isDeleted: false,
  mentions: [], attachments: [], isMine: false, canEdit: false, canDelete: false, ...over,
});

const mount = (node: ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) =>
  render(<QueryClientProvider client={client}><ToastProvider>{node}</ToastProvider></QueryClientProvider>);

const composer = (over: Partial<Parameters<typeof DiscussionComposer>[0]> = {}) =>
  <DiscussionComposer members={MEMBERS} meId="u0" onSubmit={vi.fn(async () => {})} {...over} />;
const typeBody = (text: string) => fireEvent.change(screen.getByRole('combobox'), { target: { value: text } });
const press = (key: string, opts: object = {}) => fireEvent.keyDown(screen.getByRole('combobox'), { key, ...opts });

// jsdom lacks these scroll APIs used by the component
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = function () {} as never;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};

beforeEach(() => { saveSession(SESSION); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

describe('DiscussionComposer', () => {
  it('Enter submits, Shift+Enter does not', async () => {
    const onSubmit = vi.fn(async () => {});
    mount(composer({ onSubmit }));
    typeBody('chào');
    press('Enter');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'chào' }), expect.anything()));
    onSubmit.mockClear();
    press('Enter', { shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('never submits during IME composition', () => {
    const onSubmit = vi.fn(async () => {});
    mount(composer({ onSubmit }));
    typeBody('xin chào');
    press('Enter', { isComposing: true, nativeEvent: { isComposing: true } });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('coarse-pointer Enter does not send and is not prevented', async () => {
    const orig = window.matchMedia;
    try {
      window.matchMedia = ((q: string) => ({
        matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
      })) as typeof window.matchMedia;
      const onSubmit = vi.fn(async () => {});
      mount(composer({ onSubmit }));
      typeBody('chào');
      // on coarse pointers Enter is left un-prevented so the textarea gains a newline
      expect(fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })).toBe(true);
      await new Promise(r => setTimeout(r, 20));
      expect(onSubmit).not.toHaveBeenCalled();
    } finally { window.matchMedia = orig; }
  });

  it('mention combobox: ArrowDown+Enter picks a member', async () => {
    const onSubmit = vi.fn(async () => {});
    mount(composer({ onSubmit }));
    const ta = screen.getByRole('combobox');
    fireEvent.change(ta, { target: { value: '@An' } });
    const list = await screen.findByRole('listbox');
    fireEvent.keyDown(ta, { key: 'ArrowDown' });
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect((ta as HTMLTextAreaElement).value).toBe('@An Bình ');
    expect(screen.queryByRole('listbox')).toBeNull();
    press('Enter');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ body: '@An Bình', mentionUserIds: ['u1'] }), expect.anything()));
    void list;
  });

  it('Escape closes the mention list', async () => {
    mount(composer());
    typeBody('@An');
    await screen.findByRole('listbox');
    press('Escape');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not reopen the list after a completed mention', async () => {
    mount(composer());
    typeBody('@An Bình xin chào');
    await new Promise(r => setTimeout(r, 30));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByText('Không có thành viên phù hợp')).toBeNull();
  });

  it('sends only live mention ids', async () => {
    const onSubmit = vi.fn(async () => {});
    mount(composer({ onSubmit }));
    const ta = screen.getByRole('combobox');
    fireEvent.change(ta, { target: { value: '@An' } });
    await screen.findByRole('listbox');
    fireEvent.keyDown(ta, { key: 'ArrowDown' });
    fireEvent.keyDown(ta, { key: 'Enter' });
    fireEvent.change(ta, { target: { value: 'chào @An Bình' } }); // cursor query broken → mention deleted from text
    fireEvent.change(ta, { target: { value: 'chào' } });
    press('Enter');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ mentionUserIds: [] }), expect.anything()));
  });
});

describe('ProjectDiscussion', () => {
  const page = (items: MessageDto[], nextCursor: string | null = null): MessagePageDto => ({ items, nextCursor });
  const stubPage = (items: MessageDto[], nextCursor: string | null = null) =>
    vi.spyOn(discussionService, 'page').mockResolvedValue(page(items, nextCursor));

  it('renders chronologically, newest last', async () => {
    stubPage([msg({ id: 'm2', body: 'sau' }), msg({ id: 'm1', body: 'trước' })]);
    mount(<ProjectDiscussion projectId="p1" members={MEMBERS} />);
    await screen.findByText('trước');
    const bodies = screen.getAllByText(/trước|sau/);
    expect(bodies[0].textContent).toBe('trước');
    expect(bodies[1].textContent).toBe('sau');
  });

  it('load older prepends without the new-message pill', async () => {
    vi.spyOn(discussionService, 'page')
      .mockResolvedValueOnce(page([msg({ id: 'm2', body: 'mới' })], 'cur'))
      .mockResolvedValue(page([msg({ id: 'm1', body: 'cũ' })]));
    mount(<ProjectDiscussion projectId="p1" members={MEMBERS} />);
    fireEvent.click(await screen.findByRole('button', { name: /Tải tin nhắn cũ hơn|tin nhắn cũ/i }));
    await screen.findByText('cũ');
    expect(screen.queryByText('Có tin nhắn mới')).toBeNull();
  });

  it('send posts body, mentions and reply', async () => {
    stubPage([msg({ id: 'm1', body: 'gốc', canEdit: false })]);
    const post = vi.spyOn(discussionService, 'send').mockResolvedValue(msg({ id: 'm9' }));
    mount(<ProjectDiscussion projectId="p1" members={MEMBERS} />);
    await screen.findByText('gốc');
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác tin nhắn' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Trả lời' }));
    typeBody('phản hồi');
    press('Enter');
    await waitFor(() => expect(post).toHaveBeenCalledWith('p1',
      expect.objectContaining({ body: 'phản hồi', replyToMessageId: 'm1' }), expect.anything()));
  });

  it('deleted messages show the placeholder', async () => {
    stubPage([msg({ id: 'm1', body: null, isDeleted: true })]);
    mount(<ProjectDiscussion projectId="p1" members={MEMBERS} />);
    expect(await screen.findByText('Tin nhắn đã bị xóa')).toBeTruthy();
  });

  it('hides edit/delete actions without permissions', async () => {
    stubPage([msg({ id: 'm1', canEdit: false, canDelete: false, isMine: false })]);
    mount(<ProjectDiscussion projectId="p1" members={MEMBERS} />);
    await screen.findByText('xin chào');
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xóa' })).toBeNull();
  });

  it('shows the new-message pill only when scrolled up', async () => {
    const get = vi.spyOn(discussionService, 'page').mockResolvedValue(page([msg({ id: 'm1' })]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mount(<ProjectDiscussion projectId="p1" members={MEMBERS} />, client);
    await screen.findByText('xin chào');
    // fake a tall container scrolled to top
    const scrollEl = document.querySelector('[data-discussion-scroll]') ?? document.querySelector('.overflow-y-auto');
    if (scrollEl) {
      Object.defineProperties(scrollEl, {
        scrollHeight: { value: 3000, configurable: true },
        clientHeight: { value: 400, configurable: true },
        scrollTop: { value: 0, writable: true, configurable: true },
      });
      fireEvent.scroll(scrollEl);
    }
    get.mockResolvedValue(page([msg({ id: 'm2', body: 'tin mới' }), msg({ id: 'm1' })]));
    await client.invalidateQueries({ queryKey: qk.projectDiscussion('u0', 'p1') });
    await screen.findByText('tin mới');
    if (scrollEl) expect(await screen.findByText('Có tin nhắn mới')).toBeTruthy();
  });

  it('empty, error+retry and loading states', async () => {
    vi.spyOn(discussionService, 'page')
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(page([]));
    const { unmount } = mount(<ProjectDiscussion projectId="p1" members={MEMBERS} />);
    expect(await screen.findByText(/Không tải được|thử lại/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /thử lại|Thử lại/i }));
    await screen.findByText('Chưa có trao đổi nào. Gửi tin nhắn đầu tiên cho cả nhóm.');
    unmount();
  });

  it('shows the loading skeleton while fetching', () => {
    vi.spyOn(discussionService, 'page').mockReturnValue(new Promise(() => {}));
    mount(<ProjectDiscussion projectId="p1" members={MEMBERS} />);
    expect(screen.getByRole('status', { hidden: true }).textContent).toContain('Đang tải thảo luận');
  });
});
