/**
 * KentuOS UI primitives — cards, badges, buttons, grid, outline icons, insight parsing.
 */
import React from 'react';
import './kentuos.css';

const ICON_STROKE = 1.75;

export function KentuIcon({ name, size = 24, className = '' }) {
  const s = size;
  const common = {
    width: s,
    height: s,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    className,
    'aria-hidden': true,
  };
  const o = { stroke: 'currentColor', strokeWidth: ICON_STROKE, strokeLinecap: 'round', strokeLinejoin: 'round' };

  switch (name) {
    case 'chart':
      return (
        <svg {...common}>
          <path d="M4 19V5" {...o} />
          <path d="M4 19h16" {...o} />
          <path d="M8 16V10" {...o} />
          <path d="M12 16V7" {...o} />
          <path d="M16 16v-5" {...o} />
          <path d="M20 16V9" {...o} />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" {...o} />
          <path d="M20 20l-4-4" {...o} />
        </svg>
      );
    case 'bulb':
      return (
        <svg {...common}>
          <path d="M9 18h6" {...o} />
          <path d="M10 22h4" {...o} />
          <path d="M12 15a5 5 0 0 1-3-4 5 5 0 0 1 6 0 5 5 0 0 1-3 4z" {...o} />
        </svg>
      );
    case 'scales':
      return (
        <svg {...common}>
          <path d="M12 3v18" {...o} />
          <path d="M5 7l4 4 4-4 4 4" {...o} />
          <path d="M5 7H3v4h4" {...o} />
          <path d="M19 7h2v4h-4" {...o} />
        </svg>
      );
    case 'run':
      return (
        <svg {...common}>
          <circle cx="14" cy="5" r="2" {...o} />
          <path d="M6 21l4-6 2 2 3-8 4 2" {...o} />
          <path d="M9 15l-3 6" {...o} />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" {...o} />
          <path d="M16 3v4M8 3v4M3 11h18" {...o} />
        </svg>
      );
    case 'dna':
      return (
        <svg {...common}>
          <path d="M6 4c2 2 2 4 0 6s-2 4 0 6 2 4 0 6" {...o} />
          <path d="M18 4c-2 2-2 4 0 6s2 4 0 6-2 4 0 6" {...o} />
          <path d="M9 7h6M9 12h6M9 17h6" {...o} />
        </svg>
      );
    case 'sliders':
      return (
        <svg {...common}>
          <path d="M4 7h10M15 7h5" {...o} />
          <path d="M4 12h5M10 12h10" {...o} />
          <path d="M4 17h14M19 17h1" {...o} />
          <circle cx="14" cy="7" r="2" {...o} />
          <circle cx="8" cy="12" r="2" {...o} />
          <circle cx="17" cy="17" r="2" {...o} />
        </svg>
      );
    case 'gear':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" {...o} />
          <path
            d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"
            {...o}
          />
        </svg>
      );
    case 'caret':
      return (
        <svg {...common}>
          <path d="M6 9l6 6 6-6" {...o} />
        </svg>
      );
    case 'arrow-left':
      return (
        <svg {...common}>
          <path d="M15 18l-6-6 6-6" {...o} />
        </svg>
      );
    case 'camera':
      return (
        <svg {...common}>
          <path d="M4 8h3l2-2h6l2 2h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" {...o} />
          <circle cx="12" cy="14" r="3" {...o} />
        </svg>
      );
    case 'x':
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6L6 18" {...o} />
        </svg>
      );
    case 'send':
      return (
        <svg {...common}>
          <path d="M22 2L11 13" {...o} />
          <path d="M22 2L15 22l-4-9-9-4 20-7z" {...o} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" {...o} />
        </svg>
      );
  }
}

const BADGE_LABELS = {
  positive: 'OK',
  negative: 'HIGH',
  warn: 'WATCH',
  neutral: 'DATA',
};

export function KentuBadge({ variant = 'neutral', label }) {
  const v = variant in BADGE_LABELS ? variant : 'neutral';
  return (
    <span className={`kentu-badge kentu-badge--${v}`}>
      <span className="kentu-badge__dot" />
      {label ?? BADGE_LABELS[v]}
    </span>
  );
}

export function KentuButton({ variant = 'secondary', className = '', type = 'button', children, ...rest }) {
  return (
    <button type={type} className={`kentu-btn kentu-btn--${variant} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}

/** Parse AI block → title, status, bullets, bar rows, remainder line */
export function parseInsightBlock(block) {
  const raw = String(block ?? '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) {
    return { title: 'Sistema', status: 'neutral', bullets: [], bars: [], remainder: '' };
  }

  const joinRest = (arr) => arr.join('\n');

  function inferStatusFromText(t) {
    const u = t.toUpperCase();
    if (/🔴|ALTA|ALTO|HIGH|CRIT|ALLARME|RISCHIO|NEG|PERICOLO|⚠️\s*ALTA/i.test(t)) return 'negative';
    if (/🟢|OK|OTTIM|BASSO RISCHIO|STABILE|IDEAL|POSITIV/i.test(t)) return 'positive';
    if (/🟡|MEDIO|MEDIUM|MODERAT|ATTENZIONE/i.test(t)) return 'warn';
    if (/ELEVAT|CRONIC|STRESS|ALTO\b/i.test(u)) return 'negative';
    return 'neutral';
  }

  let title = cleanTitleLine(lines[0]);
  let status = inferStatusFromText(joinRest(lines));

  const bullets = [];
  const bars = [];
  const other = [];

  for (let i = 1; i < lines.length; i++) {
    const L = lines[i];
    if (isBarLine(L)) {
      bars.push(L);
    } else if (/^[•\-\*›]\s/.test(L) || /^\d+[\.)]\s/.test(L)) {
      bullets.push(L.replace(/^[•\-\*›]\s*/, '').replace(/^\d+[\.)]\s*/, ''));
    } else if (/👉|AZIONE:|ACTION:/i.test(L)) {
      bullets.push(L.replace(/👉\s*/, ''));
    } else {
      other.push(L);
    }
  }

  const remainder = other.join('\n');

  return { title, status, bullets, bars, remainder };
}

function cleanTitleLine(line) {
  let s = String(line);
  s = s.replace(/\*\*/g, '');
  s = s.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/gu, '').trim();
  return s || 'Insight';
}

function isBarLine(line) {
  return /\[([█░.\s]+)\]/.test(line) || /(█|░){3,}/.test(line);
}

function parseBarFraction(line) {
  const bracket = line.match(/\[([█░.\s]+)\]/);
  if (bracket) {
    const seg = bracket[1].replace(/\s/g, '');
    const filled = (seg.match(/█/g) || []).length;
    const empty = (seg.match(/░/g) || []).length;
    const dots = (seg.match(/\./g) || []).length;
    const total = filled + empty + dots || 10;
    const pct = Math.round((100 * filled) / total);
    return { pct: Math.min(100, Math.max(0, pct)), raw: line };
  }
  return { pct: null, raw: line };
}

function MetricRow({ line }) {
  const { pct, raw } = parseBarFraction(line);
  const withoutBracket = raw.replace(/\[[█░.\s]+\]\s*/, ' ').trim();
  const colon = withoutBracket.indexOf(':');
  let label = withoutBracket;
  let hint = '';
  if (colon > 0) {
    label = withoutBracket.slice(0, colon).trim();
    hint = withoutBracket.slice(colon + 1).trim();
  }
  const width = pct != null ? pct : 36;

  return (
    <div className="kentu-metric-row">
      <span className="kentu-metric-row__label">{label}</span>
      <div className="kentu-metric-bar" aria-hidden>
        <div className="kentu-metric-bar__fill" style={{ width: `${width}%` }} />
      </div>
      {hint ? <span className="kentu-metric-row__hint">{hint}</span> : <span className="kentu-metric-row__hint" />}
    </div>
  );
}

export function KentuInsightHero({ block }) {
  const { title, status, bullets, bars, remainder } = parseInsightBlock(block);
  const showBullets = bullets.slice(0, 3);
  const showBars = bars.slice(0, 3);

  return (
    <article className="kentu-card kentu-card--hero">
      <div className="kentu-insight-hero__head">
        <h3 className="kentu-insight-title">{title}</h3>
        <KentuBadge variant={status} />
      </div>
      {showBars.length > 0 && (
        <div className="kentu-insight-bars">
          {showBars.map((line, i) => (
            <MetricRow key={i} line={line} />
          ))}
        </div>
      )}
      {showBullets.length > 0 && (
        <ul className="kentu-insight-list kentu-insight-list--clamp">
          {showBullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {remainder ? (
        <p className="kentu-insight-raw kentu-line-clamp-4" style={{ marginTop: showBullets.length || showBars.length ? 10 : 0 }}>
          {remainder}
        </p>
      ) : null}
    </article>
  );
}

export function KentuInsightCard({ block }) {
  const { title, status, bullets, bars, remainder } = parseInsightBlock(block);
  const showBullets = bullets.slice(0, 3);
  const showBars = bars.slice(0, 2);

  return (
    <article className="kentu-card kentu-card--insight">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <h4
          style={{
            margin: 0,
            fontSize: '0.88rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1.3,
            flex: 1,
            minWidth: 0,
            color: '#f1f5f9',
          }}
        >
          {title}
        </h4>
        <KentuBadge variant={status} />
      </div>
      {showBars.map((line, i) => (
        <MetricRow key={i} line={line} />
      ))}
      {showBullets.length > 0 ? (
        <ul className="kentu-insight-list" style={{ marginTop: 8 }}>
          {showBullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
      {remainder ? (
        <p className="kentu-insight-raw kentu-line-clamp-4" style={{ marginTop: 8 }}>
          {remainder}
        </p>
      ) : null}
    </article>
  );
}

export function KentuGridItem({ icon, title, subtitle, highlighted, onClick }) {
  return (
    <button
      type="button"
      className={`kentu-grid-item${highlighted ? ' kentu-grid-item--highlight' : ''}`}
      onClick={onClick}
    >
      <span className="kentu-grid-item__icon">
        <KentuIcon name={icon} size={28} />
      </span>
      <span className="kentu-grid-item__title">{title}</span>
      <span className="kentu-grid-item__desc">{subtitle}</span>
    </button>
  );
}
