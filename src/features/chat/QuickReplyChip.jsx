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
    ? 'border-cyan-400/55 bg-cyan-500/15 text-cyan-50 hover:bg-cyan-500/25'
    : 'border-zinc-600/80 bg-zinc-900/80 text-zinc-100 hover:border-cyan-500/35 hover:bg-zinc-800/90';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'kentu-quick-reply-chip',
        'inline-flex min-h-[3rem] w-full items-center justify-center',
        'rounded-2xl border px-4 py-3 text-base font-semibold',
        'transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/45',
        variantClass,
        className,
      ].join(' ')}
    >
      {text}
    </button>
  );
}

/**
 * Griglia verticale di chip sotto un messaggio AI.
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
        'kentu-quick-reply-chip-row flex w-full max-w-[min(92%,28rem)] flex-col gap-2.5 py-1',
        align === 'end' ? 'items-end' : 'items-start',
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
