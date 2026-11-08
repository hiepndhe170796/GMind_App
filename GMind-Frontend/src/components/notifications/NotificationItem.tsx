import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../ui/Icon';
import { notificationTarget, typeIcon, typeTone, vnTime, type NotificationDto } from '../../services/notifications';
import { timestamp } from '../../utils/presentation';

const CLOCK = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });

export default function NotificationItem({ item, busy, onRead, navState }: {
  item: NotificationDto; busy: boolean; onRead: () => void;
  navState: { navigationSection: string; returnTo: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const bodyId = useId();
  const target = notificationTarget(item);
  const date = timestamp(item.createdAt);
  const dateTime = Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  // Real DOM overflow decides the toggle — a long-but-short body shouldn't offer Xem thêm.
  useLayoutEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    if (expanded) return; // keep canExpand while expanded so Thu gọn stays
    const measure = () => setCanExpand(node.scrollHeight > node.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [expanded, item.id]);
  return (
    <li data-notification-id={item.id} data-read={item.isRead} className="notification-row">
      <span className={`notification-icon ${item.isRead ? 'bg-slate-100 text-slate-600' : `bg-white ${typeTone(item.type)}`}`}>
        <Icon name={typeIcon(item.type)} size={18} />
      </span>
      <div className="min-w-0">
        <h4 tabIndex={-1} className={`notification-title ${item.isRead ? 'font-medium text-slate-800' : 'font-semibold text-slate-950'}`}>
          {item.title || 'Thông báo'}
        </h4>
        {item.body && <p ref={bodyRef} id={bodyId} className={`mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600 [overflow-wrap:anywhere] ${!expanded ? 'line-clamp-3' : ''}`}>{item.body}</p>}
        {item.body && canExpand && (
          <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls={bodyId}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary-700 hover:underline">
            {expanded ? 'Thu gọn' : 'Xem thêm'}
          </button>
        )}
        <div className="notification-meta">
          <span className={`inline-flex items-center gap-1.5 ${item.isRead ? 'text-slate-600' : 'font-medium text-primary-700'}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${item.isRead ? 'bg-slate-400' : 'bg-primary-600'}`} />
            {item.isRead ? 'Đã đọc' : 'Chưa đọc'}
          </span>
          <time dateTime={dateTime} aria-label={dateTime ? `${vnTime(item.createdAt)} (UTC+7)` : undefined}
            title={dateTime ? `${vnTime(item.createdAt)} (UTC+7)` : undefined}>
            {dateTime ? CLOCK.format(date) : 'Chưa rõ thời gian'}
          </time>
          {target && (
            <Link to={target.href} state={navState} className="notification-link">
              {target.label}<Icon name="chevron-right" size={13} />
            </Link>
          )}
        </div>
      </div>
      {!item.isRead && (
        <button type="button" onClick={onRead} disabled={busy}
          aria-label={`Đánh dấu đã đọc: ${item.title}`} title="Đánh dấu đã đọc"
          className="notification-read">
          <Icon name="check" size={18} />
        </button>
      )}
    </li>
  );
}
