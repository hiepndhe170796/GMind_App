import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Card from '../ui/Card';
import Button from '../ui/Button';
import ConfirmationDialog from '../workspace/ConfirmationDialog';
import { useToast } from '../ui/Toast';
import { ErrorState } from '../workspace/WorkspaceUI';
import { qk } from '../../services/query-keys';
import { discussionService, type MessageDto, type MessagePageDto } from '../../services/discussion';
import { getSessionSnapshot } from '../../services/session';
import MessageItem from './MessageItem';
import DiscussionComposer from './DiscussionComposer';
import { chronological, groupByDayVN, runStarts, todayVN, vnDayLabel } from './discussion-model';

const errMsg = (e: unknown, fb: string) =>
  typeof (e as { message?: unknown })?.message === 'string' && (e as { message: string }).message ? (e as { message: string }).message : fb;

export default function ProjectDiscussion({ projectId, members }: {
  projectId: string;
  members: { userId: string; displayName: string }[];
}) {
  const me = getSessionSnapshot()?.user.id ?? '';
  const qc = useQueryClient();
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickBottomRef = useRef(true);
  const prependRef = useRef<{ h: number; t: number } | null>(null);
  const firstLoadRef = useRef(true);
  const [editing, setEditing] = useState<MessageDto | null>(null);
  const [replyTo, setReplyTo] = useState<MessageDto | null>(null);
  const [deleting, setDeleting] = useState<MessageDto | null>(null);
  const [pill, setPill] = useState(false);
  const [composerError, setComposerError] = useState('');

  const discussionQ = useInfiniteQuery<MessagePageDto>({
    queryKey: qk.projectDiscussion(me, projectId),
    queryFn: ({ pageParam }) => discussionService.page(projectId, (pageParam as string | null) ?? null),
    initialPageParam: null,
    getNextPageParam: p => p.nextCursor,
    enabled: !!me && !!projectId,
  });

  const messages = useMemo(() => chronological(discussionQ.data?.pages ?? []), [discussionQ.data]);
  const dayGroups = useMemo(() => groupByDayVN(messages), [messages]);
  const today = todayVN();
  const msgIndex = useMemo(() => new Map(messages.map((m, i) => [m.id, i])), [messages]);
  const runs = useMemo(() => runStarts(messages), [messages]);

  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduced ? 'smooth' : 'auto' });
    setPill(false);
  };
  const nearBottom = () => {
    const el = scrollRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // First load → jump to bottom.
  useEffect(() => {
    if (firstLoadRef.current && messages.length > 0) {
      firstLoadRef.current = false;
      scrollToBottom();
    }
  }, [messages.length]);

  // New messages (newest id changed) → stick to bottom if the user was already
  // there or just sent; otherwise show the new-message pill. Loading older
  // messages only ever changes the first id, never the last.
  const lastIdRef = useRef<string | null>(null);
  useEffect(() => {
    const last = messages[messages.length - 1];
    const lastId = last?.id ?? null;
    const grew = lastId !== null && lastId !== lastIdRef.current && lastIdRef.current !== null;
    lastIdRef.current = lastId;
    if (!grew || firstLoadRef.current) return;
    if (stickBottomRef.current || last?.isMine) scrollToBottom(true);
    else setPill(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const onScroll = () => {
    if (nearBottom()) { stickBottomRef.current = true; setPill(false); }
    else stickBottomRef.current = false;
  };

  const loadOlder = async () => {
    const el = scrollRef.current;
    prependRef.current = { h: el?.scrollHeight ?? 0, t: el?.scrollTop ?? 0 };
    await discussionQ.fetchNextPage();
  };

  // Restore the viewport after React commits the prepended page (rAF can run too early).
  useLayoutEffect(() => {
    const p = prependRef.current;
    const node = scrollRef.current;
    if (p && node) {
      prependRef.current = null;
      node.scrollTop = node.scrollHeight - p.h + p.t;
    }
  }, [discussionQ.data]);

  const sendM = useMutation({
    mutationFn: ({ body, mentionUserIds, files, onProgress }: {
      body: string; mentionUserIds: string[]; files: File[]; onProgress: (p: number) => void;
    }) => discussionService.send(projectId, {
      body: body || undefined, mentionUserIds, files,
      replyToMessageId: replyTo?.id,
    }, { onProgress }),
    onSuccess: () => {
      setComposerError('');
      void qc.invalidateQueries({ queryKey: qk.projectDiscussion(me, projectId) });
      scrollToBottom();
    },
    onError: e => setComposerError(errMsg(e, 'Không gửi được tin nhắn.')),
  });

  const editM = useMutation({
    mutationFn: ({ id, body, mentionUserIds }: { id: string; body: string; mentionUserIds: string[] }) =>
      discussionService.update(id, { body, mentionUserIds }),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: qk.projectDiscussion(me, projectId) });
    },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => discussionService.remove(id),
    onSuccess: () => {
      setDeleting(null);
      toast.success('Đã xóa tin nhắn.');
      void qc.invalidateQueries({ queryKey: qk.projectDiscussion(me, projectId) });
    },
    onError: e => toast.error(errMsg(e, 'Không xóa được tin nhắn.')),
  });

  return (
    <Card className="flex h-[calc(100dvh-13rem)] min-h-[26rem] flex-col p-4 sm:p-6 lg:h-[min(72dvh,760px)]">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-section font-semibold text-ink">Thảo luận dự án</h3>
        <p className="hidden text-caption text-ink-muted sm:block">Mọi thành viên trong nhóm đều xem và gửi được.</p>
      </div>

      {discussionQ.isPending ? (
        <div className="mt-4 flex-1 space-y-4 overflow-hidden" aria-hidden="true">
          <p role="status" className="sr-only">Đang tải thảo luận…</p>
          {[0, 1, 2].map(i => (
            <div key={i} className="motion-safe:animate-pulse space-y-2">
              <div className="h-4 w-40 rounded bg-surface-subtle" />
              <div className="h-3 w-3/4 rounded bg-surface-subtle" />
            </div>
          ))}
        </div>
      ) : discussionQ.isError ? (
        <div className="mt-4 flex-1">
          <ErrorState message={errMsg(discussionQ.error, 'Không tải được thảo luận.')}
            onRetry={() => void discussionQ.refetch()} />
        </div>
      ) : (
        <div className="relative mt-3 min-h-0 flex-1">
          <div ref={scrollRef} role="log" aria-label="Tin nhắn thảo luận" onScroll={onScroll}
            className="h-full overflow-y-auto overscroll-contain pr-1">
            {discussionQ.hasNextPage && (
              <div className="pb-2 text-center">
                <Button variant="secondary" size="sm" isLoading={discussionQ.isFetchingNextPage}
                  onClick={() => void loadOlder()}>Tải tin nhắn cũ hơn</Button>
              </div>
            )}
            {messages.length === 0 ? (
              <p className="py-10 text-center text-small text-ink-muted">Chưa có trao đổi nào. Gửi tin nhắn đầu tiên cho cả nhóm.</p>
            ) : (
              dayGroups.map(g => (
                <section key={g.day} aria-label={vnDayLabel(g.day, today)} className="mt-2 first:mt-0">
                  <div className="sticky top-0 z-10 flex justify-center bg-surface py-1">
                    <span className="rounded-full bg-surface-subtle px-3 py-0.5 text-caption font-medium text-ink-secondary">
                      {vnDayLabel(g.day, today)}
                    </span>
                  </div>
                  <ul>
                    {g.messages.map((m) => {
                      const idx = msgIndex.get(m.id) ?? 0;
                      return (
                        <MessageItem key={m.id} msg={m} meId={me} runStart={runs[idx]}
                          editing={editing?.id === m.id}
                          onReply={x => { setReplyTo(x); setEditing(null); }}
                          onEdit={x => { setEditing(x); setReplyTo(null); }}
                          onDelete={setDeleting}
                          renderEdit={() => (
                            <DiscussionComposer members={members} meId={me} editing
                              initial={{ body: m.body ?? '', mentions: m.mentions }}
                              onCancelEdit={() => setEditing(null)}
                              onSubmit={async ({ body, mentionUserIds }) => {
                                await editM.mutateAsync({ id: m.id, body, mentionUserIds });
                              }} />
                          )} />
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
          {pill && (
            <button type="button" onClick={() => scrollToBottom(true)}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-primary-600 px-4 py-2 text-small font-medium text-white shadow-lg hover:bg-primary-700">
              Có tin nhắn mới
            </button>
          )}
        </div>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <DiscussionComposer members={members} meId={me}
          replyTo={replyTo} onClearReply={() => setReplyTo(null)}
          externalError={composerError}
          onSubmit={async ({ body, mentionUserIds, files }, { onProgress }) => {
            await sendM.mutateAsync({ body, mentionUserIds, files, onProgress });
          }} />
      </div>

      <ConfirmationDialog open={!!deleting} title="Xóa tin nhắn" busy={deleteM.isPending} onClose={() => setDeleting(null)}>
        <p>Xóa tin nhắn này? Nội dung và tệp đính kèm sẽ bị xóa.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" disabled={deleteM.isPending} onClick={() => setDeleting(null)}>Hủy</Button>
          <Button variant="danger" isLoading={deleteM.isPending}
            onClick={() => deleting && deleteM.mutate(deleting.id)}>Xóa</Button>
        </div>
      </ConfirmationDialog>
    </Card>
  );
}
