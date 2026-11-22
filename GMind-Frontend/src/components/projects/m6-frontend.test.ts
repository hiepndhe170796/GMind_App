import { describe, expect, it } from 'vitest';
import { validateClientFile, FILE_RULES, fileIconFor, isImageExt } from '../../utils/file-rules';
import { formatBytes } from '../../utils/presentation';
import {
  activeMentionQuery, chronological, excerpt, groupByDayVN, highlightSegments,
  liveMentionIds, mentionMatches, runStarts, vnDayLabel,
} from './discussion-model';
import type { MessageDto, MessagePageDto } from '../../services/discussion';

const msg = (over: Partial<MessageDto>): MessageDto => ({
  id: over.id ?? 'm', projectId: 'p', authorUserId: 'u1', authorName: 'An',
  body: 'x', createdAt: over.createdAt ?? '2026-11-20T01:00:00Z',
  isDeleted: false, mentions: [], attachments: [], isMine: false,
  canEdit: false, canDelete: false, ...over,
});

describe('file rules', () => {
  it('rejects empty, oversize and disallowed types with exact VN messages', () => {
    expect(validateClientFile({ name: 'a.png', size: 0 })).toBe('Tệp trống.');
    expect(validateClientFile({ name: 'a.png', size: FILE_RULES.MAX_FILE_BYTES + 1 })).toBe('Tệp vượt quá 10 MB.');
    expect(validateClientFile({ name: 'a.exe', size: 10 })).toBe('Định dạng tệp không được hỗ trợ.');
    expect(validateClientFile({ name: 'a', size: 10 })).toBe('Định dạng tệp không được hỗ trợ.');
    expect(validateClientFile({ name: 'a.PNG', size: 10 })).toBeNull();
    expect(validateClientFile({ name: 'a.pdf', size: FILE_RULES.MAX_FILE_BYTES })).toBeNull();
  });
  it('icons', () => {
    expect(fileIconFor('png')).toBe('photo');
    expect(fileIconFor('pdf')).toBe('file');
    expect(isImageExt('jpeg')).toBe(true);
    expect(isImageExt('zip')).toBe(false);
  });
});

describe('formatBytes', () => {
  it('vi-VN formats', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(12 * 1024)).toBe('12 KB');
    expect(formatBytes(1.2 * 1024 * 1024)).toBe('1,2 MB');
    expect(formatBytes(0)).toBe('0 B');
  });
});

describe('discussion model', () => {
  const pages: MessagePageDto[] = [
    { items: [msg({ id: 'm6', createdAt: '2026-11-20T03:00:00Z' }), msg({ id: 'm5', createdAt: '2026-11-20T02:00:00Z' })], nextCursor: 'c' },
    { items: [msg({ id: 'm4', createdAt: '2026-11-20T01:00:00Z' })], nextCursor: null },
  ];
  it('chronological flips pages+items oldest-first', () => {
    expect(chronological(pages).map(m => m.id)).toEqual(['m4', 'm5', 'm6']);
  });
  it('groupByDayVN groups by VN day', () => {
    const groups = groupByDayVN(chronological(pages));
    expect(groups).toHaveLength(1);
    expect(groups[0].messages.map(m => m.id)).toEqual(['m4', 'm5', 'm6']);
  });
  it('runStarts on author change, gap, day change, deleted', () => {
    const t = '2026-11-20T01:00:00Z';
    const t2 = '2026-11-20T01:02:00Z';
    const gap = '2026-11-20T01:10:00Z';
    const msgs = [
      msg({ id: 'a', createdAt: t }),
      msg({ id: 'b', createdAt: t2 }),                                  // same run
      msg({ id: 'c', authorUserId: 'u2', createdAt: '2026-11-20T01:03:00Z' }), // author change
      msg({ id: 'd', createdAt: gap }),                                 // >5min gap
      msg({ id: 'e', isDeleted: true, createdAt: '2026-11-20T01:11:00Z' }),
      msg({ id: 'f', createdAt: '2026-11-20T01:12:00Z' }),              // after deleted
    ];
    expect(runStarts(msgs)).toEqual([true, false, true, true, true, true]);
  });
  it('highlightSegments longest-first, regex chars, isMe', () => {
    const segs = highlightSegments('Chào @An Nguyễn và @An (x+1)!', [
      { userId: 'u1', displayName: 'An' }, { userId: 'u2', displayName: 'An Nguyễn' },
    ], 'u2');
    expect(segs.filter(s => s.type === 'mention')).toEqual([
      { type: 'mention', text: '@An Nguyễn', userId: 'u2', isMe: true },
      { type: 'mention', text: '@An', userId: 'u1', isMe: false },
    ]);
  });
  it('highlightSegments only mentioned names', () => {
    const segs = highlightSegments('Hi @Nobody', [{ userId: 'u1', displayName: 'An' }], 'me');
    expect(segs).toEqual([{ type: 'text', text: 'Hi @Nobody' }]);
  });
  it('excerpt truncates', () => {
    expect(excerpt('a'.repeat(200), 120)).toHaveLength(120);
    expect(excerpt('ngắn')).toBe('ngắn');
  });
  it('activeMentionQuery', () => {
    expect(activeMentionQuery('@Ng', 3)).toEqual({ start: 0, query: 'Ng' });
    expect(activeMentionQuery('chao @Ng V', 10)).toEqual({ start: 5, query: 'Ng V' });
    expect(activeMentionQuery('a@b', 3)).toBeNull();
    expect(activeMentionQuery('x @line\nb', 9)).toBeNull();
    expect(activeMentionQuery(`@${'q'.repeat(31)}`, 32)).toBeNull();
    expect(activeMentionQuery('no at', 5)).toBeNull();
  });
  it('liveMentionIds drops removed names, dedupes', () => {
    expect(liveMentionIds('hi @An', [{ userId: 'u1', displayName: 'An' }, { userId: 'u2', displayName: 'Bo' }]))
      .toEqual(['u1']);
  });
  it('mentionMatches excludes me, diacritic-insensitive, prefix first', () => {
    const members = [
      { userId: 'me', displayName: 'Me' },
      { userId: 'a', displayName: 'Nguyễn Văn An' },
      { userId: 'b', displayName: 'Trần An' },
      { userId: 'c', displayName: 'Lê An' },
    ];
    // 'an': none start with it → all "contains", pool order kept
    expect(mentionMatches(members, 'an', 'me').map(m => m.userId)).toEqual(['a', 'b', 'c']);
    // 'tran' prefix-matches 'Trần An' diacritic-insensitively
    expect(mentionMatches(members, 'tran', 'me').map(m => m.userId)).toEqual(['b']);
    expect(mentionMatches(members, 'nguyen', 'me').map(m => m.userId)).toEqual(['a']);
    expect(mentionMatches(members, '', 'me').map(m => m.userId)).toEqual(['a', 'b', 'c']);
  });
  it('vnDayLabel', () => {
    const today = '2026-11-20';
    expect(vnDayLabel('2026-11-20', today)).toBe('Hôm nay');
    expect(vnDayLabel('2026-11-19', today)).toBe('Hôm qua');
    expect(vnDayLabel('2026-11-16', today)).toContain('tháng 11');
  });
});
