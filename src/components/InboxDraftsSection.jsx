import {
  extractUnassignedDraftBlocks,
  formatInboxDraftCardLabel,
  isClaudeDraftBlock,
} from '../utils/mealDraftStatus';
import {
  openExternalDraftDate,
  useExternalMealDrafts,
} from '../features/externalDrafts/externalDraftsStore.js';
import { formatExternalDraftDay } from '../features/externalDrafts/externalMealDrafts.js';

/** Richiamo alle bozze esterne ferme su altri giorni: tocco → apre quel giorno. */
export function ExternalDraftsOtherDays({ otherDays = [], className = '' }) {
  if (!Array.isArray(otherDays) || otherDays.length === 0) return null;
  const total = otherDays.reduce((sum, day) => sum + day.count, 0);
  return (
    <div className={`inbox-drafts__other-days ${className}`.trim()}>
      <span className="inbox-drafts__other-days-label">
        {total === 1 ? '1 bozza da Claude' : `${total} bozze da Claude`} in altri giorni:
      </span>
      {otherDays.map((day) => (
        <button
          key={day.date}
          type="button"
          className="inbox-drafts__day-chip"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openExternalDraftDate(day.date);
          }}
        >
          {formatExternalDraftDay(day.date)}
          {day.count > 1 ? ` · ${day.count}` : ''}
        </button>
      ))}
    </div>
  );
}

/**
 * Card Inbox in cima al Diario / menu PASTI. Nascosta se non ci sono bozze.
 */
export default function InboxDraftsSection({
  log = [],
  onSelectDraft = null,
  compact = false,
}) {
  const external = useExternalMealDrafts();
  const blocks = [...external.blocks, ...extractUnassignedDraftBlocks(log)];
  if (blocks.length === 0 && external.otherDays.length === 0) return null;

  return (
    <section
      className={compact ? 'inbox-drafts inbox-drafts--compact' : 'inbox-drafts'}
      aria-label="Inbox appunti in sospeso"
    >
      <h3 className="inbox-drafts__title">📥 Inbox / Appunti in sospeso</h3>
      {blocks.length > 0 ? (
        <div className="inbox-drafts__list">
          {blocks.map((block) => (
            <button
              key={block.id}
              type="button"
              className="inbox-drafts__card"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelectDraft?.(block);
              }}
            >
              <span className="inbox-drafts__card-label">
                {formatInboxDraftCardLabel(block)}
              </span>
              {isClaudeDraftBlock(block) ? (
                <span className="inbox-drafts__badge">da Claude</span>
              ) : null}
              <span className="inbox-drafts__card-cta">Smista</span>
            </button>
          ))}
        </div>
      ) : null}
      <ExternalDraftsOtherDays otherDays={external.otherDays} />
    </section>
  );
}
