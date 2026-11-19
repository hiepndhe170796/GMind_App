export type IllustrationName = 'tasks' | 'groups' | 'search' | 'calendar' | 'inbox' | 'handoff' | 'lost';

const P = 'stroke-primary-500';
const F = 'fill-primary-50';
const A = 'stroke-accent-500';
const AF = 'fill-accent-100';
const N = 'stroke-line-strong';

export default function Illustration({ name, className = '' }: { name: IllustrationName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 88" fill="none" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {name === 'tasks' && (<>
        <rect x="14" y="26" width="58" height="42" rx="6" className={`${N} ${F}`} />
        <rect x="26" y="16" width="58" height="42" rx="6" className={`${P} ${F}`} />
        <line x1="36" y1="30" x2="66" y2="30" className={P} />
        <line x1="36" y1="40" x2="58" y2="40" className={N} />
        <line x1="36" y1="50" x2="52" y2="50" className={N} />
        <circle cx="90" cy="58" r="13" className={`${A} ${AF}`} />
        <path d="M84.5 58.5l3.8 3.8 6.5-7.5" className={A} />
      </>)}
      {name === 'groups' && (<>
        <circle cx="38" cy="34" r="13" className={`${N} ${F}`} />
        <circle cx="38" cy="30" r="5" className={N} />
        <path d="M27 41c2-6 7-8 11-8s9 2 11 8" className={N} />
        <circle cx="82" cy="34" r="13" className={`${N} ${F}`} />
        <circle cx="82" cy="30" r="5" className={N} />
        <path d="M71 41c2-6 7-8 11-8s9 2 11 8" className={N} />
        <circle cx="60" cy="50" r="15" className={`${A} ${AF}`} />
        <circle cx="60" cy="46" r="5.5" className={A} />
        <path d="M48 58c2.5-7 7.5-9.5 12-9.5s9.5 2.5 12 9.5" className={A} />
      </>)}
      {name === 'search' && (<>
        <rect x="18" y="14" width="64" height="48" rx="7" className={`${P} ${F}`} />
        <line x1="30" y1="28" x2="62" y2="28" className={P} />
        <line x1="30" y1="38" x2="54" y2="38" className={N} />
        <line x1="30" y1="48" x2="48" y2="48" className={N} />
        <circle cx="86" cy="58" r="12" className={`${A} ${AF}`} />
        <line x1="95" y1="67" x2="104" y2="76" className={A} strokeWidth={2} />
      </>)}
      {name === 'calendar' && (<>
        <rect x="24" y="16" width="72" height="56" rx="7" className={`${P} ${F}`} />
        <line x1="24" y1="30" x2="96" y2="30" className={P} />
        <line x1="40" y1="10" x2="40" y2="20" className={N} />
        <line x1="80" y1="10" x2="80" y2="20" className={N} />
        {[38, 52].map(y => [38, 56, 74].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" className={N} />))}
        <circle cx="74" cy="66" r="4.5" className={`${A} ${AF}`} />
      </>)}
      {name === 'inbox' && (<>
        <path d="M60 18c-12 0-20 8-20 18v10c0 3-2.5 6-5 7.5-1.5 1-.5 3.5 1.5 3.5h47c2 0 3-2.5 1.5-3.5-2.5-1.5-5-4.5-5-7.5V36c0-10-8-18-20-18z" className={`${P} ${F}`} />
        <path d="M53 64a7 7 0 0014 0" className={P} />
        <circle cx="84" cy="26" r="7" className={`${A} ${AF}`} />
      </>)}
      {name === 'handoff' && (<>
        <rect x="14" y="22" width="36" height="26" rx="6" className={`${P} ${F}`} />
        <line x1="23" y1="32" x2="41" y2="32" className={N} />
        <rect x="70" y="46" width="36" height="26" rx="6" className={`${P} ${F}`} />
        <line x1="79" y1="56" x2="97" y2="56" className={N} />
        <path d="M56 30c10-8 22-8 30-2m0 0-4-5m4 5-6 3" className={A} />
        <path d="M64 62c-10 8-22 8-30 2m0 0 4 5m-4-5 6-3" className={A} />
      </>)}
      {name === 'lost' && (<>
        <path d="M12 69l9 9m0-9-9 9" className={A} />
        <path d="M27 73h35c8 0 8-13 0-13H40c-8 0-8-13 0-13h32c10 0 16 10 16 27" strokeDasharray="4 5" className={P} />
        <path d="M88 34c9 0 16 7 16 15 0 11-16 25-16 25S72 60 72 49c0-8 7-15 16-15z" className={`${P} ${F}`} />
        <circle cx="88" cy="48" r="5" className={P} />
      </>)}
    </svg>
  );
}
