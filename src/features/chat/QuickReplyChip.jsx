import React from 'react';

/**
 * Chip touch-friendly per quick reply sotto i messaggi AI (tablet / mobilità).
 */
export default function QuickReplyChip({
  label,
  onClick,
  disabled = false,
  variant = 'default',
  className = '',
}) {
  const text = String(label || '').trim();
  if (!text) return null;

  const variantClass = variant === 'primary'
    ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/18'
    : 'border-white/12 bg-white/[0.06] text-zinc-100 hover:border-cyan-400/30 hover:bg-white/[0.1]';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'kentu-quick-reply-chip',
        'inline-flex min-h-[2.5rem] w-full min-w-0 items-center justify-center',
        'rounded-xl border px-2.5 py-1.5 text-sm font-medium leading-snug',
        'backdrop-blur-md shadow-[0_4px_16px_rgba(0,0,0,0.18)]',
        'transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/45',
        variantClass,
        className,
      ].join(' ')}
    >
      <span className="line-clamp-2 text-center">{text}</span>
    </button>
  );
}

/**
 * Griglia compatta 2 colonne di chip sotto un messaggio AI.
 */
export function QuickReplyChipRow({
  replies = [],
  onChipClick,
  disabled = false,
  align = 'start',
}) {
  const items = (replies || [])
    .map((entry) => {
      if (entry && typeof entry === 'object') {
        return {
          label: String(entry.label || entry.text || '').trim(),
          intent: entry.intent || entry.action || null,
          variant: entry.variant || 'default',
          raw: entry,
        };
      }
      const label = String(entry || '').trim();
      return label ? { label, intent: null, variant: 'default', raw: entry } : null;
    })
    .filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div
      className={[
        'kentu-quick-reply-chip-row grid w-full max-w-[min(92%,28rem)] grid-cols-2 gap-2 py-1',
        align === 'end' ? 'ml-auto' : 'mr-auto',
      ].join(' ')}
    >
      {items.map((item, index) => (
        <QuickReplyChip
          key={`${item.label}-${index}`}
          label={item.label}
          variant={item.variant}
          disabled={disabled}
          onClick={() => onChipClick?.(item.raw ?? item, index)}
        />
      ))}
    </div>
  );
}
