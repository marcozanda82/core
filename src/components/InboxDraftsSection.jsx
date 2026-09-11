import {
  extractUnassignedDraftBlocks,
  formatInboxDraftCardLabel,
} from '../utils/mealDraftStatus';

/**
 * Card Inbox in cima al Diario / menu PASTI. Nascosta se non ci sono bozze.
 */
export default function InboxDraftsSection({
  log = [],
  onSelectDraft = null,
  compact = false,
}) {
  const blocks = extractUnassignedDraftBlocks(log);
  if (blocks.length === 0) return null;

  return (
    <section
      className={compact ? 'inbox-drafts inbox-drafts--compact' : 'inbox-drafts'}
      aria-label="Inbox appunti in sospeso"
    >
      <h3 className="inbox-drafts__title">📥 Inbox / Appunti in sospeso</h3>
      <div className="inbox-drafts__list">
        {blocks.map((block) => (
          <button
            key={block.id}
            type="button"
            className="inbox-drafts__card"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              console.log('Tentativo apertura smistamento per:', block);
              onSelectDraft?.(block);
            }}
          >
            <span className="inbox-drafts__card-label">
              {formatInboxDraftCardLabel(block)}
            </span>
            <span className="inbox-drafts__card-cta">Smista</span>
          </button>
        ))}
      </div>
    </section>
  );
}
