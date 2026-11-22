import type { MessageDto, MessagePageDto, MentionDto } from '../../services/discussion';

export const VN_DAY_KEY = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

const WEEKDAY = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long' });
const VN_TIME = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
const VN_FULL = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const vnMsgTime = (iso: string): string => VN_TIME.format(new Date(iso));
export const vnMsgFull = (iso: string): string => VN_FULL.format(new Date(iso));

/** "Hôm nay" / "Hôm qua" / "Thứ Hai, 16 tháng 11" in VN time. */
export function vnDayLabel(day: string, today: string): string {
  if (day === today) return 'Hôm nay';
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
  if (diff === 1) return 'Hôm qua';
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  const [, mm, dd] = day.split('-');
  return `${WEEKDAY.format(d)}, ${Number(dd)} tháng ${Number(mm)}`;
}
export const todayVN = (): string => VN_DAY_KEY(new Date().toISOString());

/** Pages are fetched newest-first with newest-first items; returns oldest-first. */
export function chronological(pages: MessagePageDto[]): MessageDto[] {
  return [...pages].reverse().flatMap(p => [...p.items].reverse());
}

export interface DayGroup { day: string; messages: MessageDto[] }

/** Groups chronological messages by VN civil day (oldest first). */
export function groupByDayVN(messages: MessageDto[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const m of messages) {
    const day = VN_DAY_KEY(m.createdAt);
    const last = out[out.length - 1];
    if (last && last.day === day) last.messages.push(m);
    else out.push({ day, messages: [m] });
  }
  return out;
}

const RUN_GAP_MS = 5 * 60 * 1000;

/** New run when the author changes, gap > 5 min, day changes, or a deleted message. */
export function runStarts(messages: MessageDto[]): boolean[] {
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    if (!prev || prev.isDeleted || m.isDeleted) return true;
    if (prev.authorUserId !== m.authorUserId) return true;
    if (VN_DAY_KEY(prev.createdAt) !== VN_DAY_KEY(m.createdAt)) return true;
    return new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > RUN_GAP_MS;
  });
}

export interface MsgSegment { type: 'text' | 'mention'; text: string; userId?: string; isMe?: boolean }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Splits body into text/@mention segments for mentioned users only — longest
 * names first, regex-escaped, case-sensitive; mention segments flag `isMe`.
 */
export function highlightSegments(body: string | null, mentions: MentionDto[], meId: string): MsgSegment[] {
  if (!body) return [];
  const sorted = [...mentions].sort((a, b) => b.displayName.length - a.displayName.length);
  if (!sorted.length) return [{ type: 'text', text: body }];
  const pattern = new RegExp(`@(${sorted.map(m => escapeRe(m.displayName)).join('|')})`, 'g');
  const segs: MsgSegment[] = [];
  let i = 0;
  for (const match of body.matchAll(pattern)) {
    if (match.index > i) segs.push({ type: 'text', text: body.slice(i, match.index) });
    const mention = sorted.find(m => m.displayName === match[1])!;
    segs.push({ type: 'mention', text: `@${match[1]}`, userId: mention.userId, isMe: mention.userId === meId });
    i = match.index + match[0].length;
  }
  if (i < body.length) segs.push({ type: 'text', text: body.slice(i) });
  return segs;
}

export function excerpt(body: string | null, max = 120): string {
  if (!body) return '';
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

export interface MentionQuery { start: number; query: string }

/** "@query" active at the caret: '@' at start/after whitespace, query ≤ 30 chars, spaces ok, no newline. */
export function activeMentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > 30 || query.includes('\n')) return null;
  return { start: at, query };
}

/** Mention ids to send: only those whose "@Name" still appears in the body. */
export function liveMentionIds(body: string, mentions: { userId: string; displayName: string }[]): string[] {
  return [...new Set(mentions.filter(m => body.includes(`@${m.displayName}`)).map(m => m.userId))];
}

/**
 * True when the text right after the active '@' starts with an already-picked
 * mention's displayName followed by whitespace or end-of-text — the mention is
 * complete, so the listbox must not reopen for the trailing text.
 */
export function mentionCompleted(text: string, at: number, picked: { displayName: string }[]): boolean {
  const after = text.slice(at + 1);
  return picked.some(m => {
    if (!after.startsWith(m.displayName)) return false;
    const next = after[m.displayName.length];
    return next === undefined || /\s/.test(next);
  });
}

/** Listbox visibility: matches always show; the empty state only for whitespace-free queries. */
export function mentionListVisible(query: string, matchCount: number): boolean {
  return matchCount > 0 || !/\s/.test(query);
}

/** Case- and diacritic-insensitive match: prefix hits first, then contains. */
export function mentionMatches<T extends { userId: string; displayName: string }>(members: T[], query: string, meId: string): T[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const q = norm(query.trim());
  const pool = members.filter(m => m.userId !== meId);
  if (!q) return pool;
  const prefix = pool.filter(m => norm(m.displayName).startsWith(q));
  const contains = pool.filter(m => !norm(m.displayName).startsWith(q) && norm(m.displayName).includes(q));
  return [...prefix, ...contains];
}
