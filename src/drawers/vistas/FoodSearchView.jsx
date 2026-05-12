import React from 'react';

/**
 * Pannello risultati ricerca alimenti (cronologia, preferiti, CREA, AI).
 * Solo presentazione e callback: nessun fetch qui.
 */
export default function FoodSearchView({
  foodNameInput,
  foodDropdownSuggestions = [],
  visibleRecentFoodEntries = [],
  visibleFrequentFoodEntries = [],
  pairedFoodSuggestions = [],
  smartSuggestedFoods = [],
  isShortFoodQuery,
  mealSuggestionLabel,
  foodSearchSources = [],
  isCreaExpanded,
  setIsCreaExpanded,
  isCreaLoading,
  triggerCreaSearch,
  getLastQuantityForFood,
  foodDb,
  localFoodDb,
  renderFoodOptionLabel,
  onSelectHabitEntry,
  onSelectLocalSuggestion,
  onSelectCatalogResult,
  onGenerateWithAi,
  isGeneratingFood,
}) {
  return (
    <div
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '0 0 12px 12px',
        maxHeight: '220px',
        overflowY: 'auto',
        zIndex: 50,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      {isShortFoodQuery && visibleFrequentFoodEntries.length > 0 ? (
        <>
          <div
            style={{
              padding: '10px 16px 8px',
              color: '#94a3b8',
              fontSize: '0.68rem',
              fontWeight: '600',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              borderBottom: '1px solid #2a2a2a',
            }}
          >
            {`⭐ I tuoi preferiti ${mealSuggestionLabel}`}
          </div>
          {visibleFrequentFoodEntries.map((entry) => (
            <button
              key={`frequent-${entry.id}-${entry.count}-${entry.lastUsed}`}
              type="button"
              style={{
                width: '100%',
                padding: '12px 16px',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.9rem',
                borderBottom: '1px solid #2a2a2a',
              }}
              onMouseDown={() => onSelectHabitEntry(entry)}
            >
              {renderFoodOptionLabel(entry.name, foodNameInput, entry.id)}
            </button>
          ))}
        </>
      ) : null}
      {isShortFoodQuery && visibleRecentFoodEntries.length > 0 ? (
        <>
          <div
            style={{
              padding: '10px 16px 8px',
              color: '#94a3b8',
              fontSize: '0.68rem',
              fontWeight: '600',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              borderBottom: '1px solid #2a2a2a',
            }}
          >
            {`🕒 Recenti ${mealSuggestionLabel}`}
          </div>
          {visibleRecentFoodEntries.map((entry) => (
            <button
              key={`recent-${entry.id}-${entry.lastUsed}`}
              type="button"
              style={{
                width: '100%',
                padding: '12px 16px',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.9rem',
                borderBottom: '1px solid #2a2a2a',
              }}
              onMouseDown={() => onSelectHabitEntry(entry)}
            >
              {renderFoodOptionLabel(entry.name, foodNameInput, entry.id)}
            </button>
          ))}
        </>
      ) : null}
      {isShortFoodQuery && pairedFoodSuggestions.length > 0 ? (
        <>
          <div
            style={{
              padding: '10px 16px 8px',
              color: '#94a3b8',
              fontSize: '0.68rem',
              fontWeight: '600',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              borderBottom: '1px solid #2a2a2a',
            }}
          >
            Spesso mangi insieme
          </div>
          {pairedFoodSuggestions.map((entry) => (
            <button
              key={`pair-${entry.id}`}
              type="button"
              style={{
                width: '100%',
                padding: '12px 16px',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.9rem',
                borderBottom: '1px solid #2a2a2a',
              }}
              onMouseDown={() => onSelectHabitEntry(entry)}
            >
              {renderFoodOptionLabel(entry.name, foodNameInput, entry.id)}
            </button>
          ))}
        </>
      ) : null}
      {isShortFoodQuery && smartSuggestedFoods.length > 0 ? (
        <>
          <div
            style={{
              padding: '10px 16px 8px',
              color: '#94a3b8',
              fontSize: '0.68rem',
              fontWeight: '600',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              borderBottom: '1px solid #2a2a2a',
            }}
          >
            🍽 Suggeriti
          </div>
          {smartSuggestedFoods.map((entry) => (
            <button
              key={`suggested-${entry.id}`}
              type="button"
              style={{
                width: '100%',
                padding: '12px 16px',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.9rem',
                borderBottom: '1px solid #2a2a2a',
              }}
              onMouseDown={() => onSelectHabitEntry(entry)}
            >
              {renderFoodOptionLabel(entry.name, foodNameInput, entry.id)}
            </button>
          ))}
        </>
      ) : null}
      {(foodDropdownSuggestions || []).map((s) => (
        <button
          key={s.key}
          type="button"
          style={{
            width: '100%',
            padding: '12px 16px',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '0.9rem',
            borderBottom: '1px solid #2a2a2a',
          }}
          onMouseDown={() => onSelectLocalSuggestion(s)}
        >
          {renderFoodOptionLabel(s.desc, foodNameInput, s.key)}
        </button>
      ))}
      {(foodSearchSources || []).map((source) => {
        const results = source.results || [];
        const isVisible = source.key === 'crea' ? isCreaExpanded : false;

        return (
          <React.Fragment key={source.key}>
            {foodNameInput.trim() ? (
              <button
                type="button"
                className="dropdown-action-button"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  textAlign: 'left',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: 'none',
                  borderTop: '1px solid #2a2a2a',
                  color: '#67e8f9',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                }}
                onMouseDown={() => {
                  if (source.key === 'crea') {
                    setIsCreaExpanded((prev) => !prev);
                  }
                }}
              >
                {`${source.label} (${results.length} risultati)`}
                <span style={{ marginLeft: 8, color: '#94a3b8', fontWeight: 500 }}>
                  {isVisible ? '▾' : '▸'}
                </span>
              </button>
            ) : null}
            {foodNameInput.trim() && source.isLoading ? (
              <div
                style={{
                  borderTop: '1px solid #2a2a2a',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    color: '#94a3b8',
                    fontSize: '0.88rem',
                  }}
                >
                  Caricamento...
                </div>
              </div>
            ) : null}
            {foodNameInput.trim() && isVisible ? (
              <div
                style={{
                  borderTop: '1px solid #2a2a2a',
                  maxHeight: 320,
                  overflowY: 'auto',
                }}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollHeight - el.scrollTop - el.clientHeight > 72) return;
                  const q = String(foodNameInput || '').trim();
                  if (q.length >= 3 && typeof triggerCreaSearch === 'function') {
                    triggerCreaSearch(q, { onlyUsda: true });
                  }
                }}
              >
                {results.map((result, index) => {
                  const desc = String(
                    result?.name_it || result?.desc || result?.name || result?.product_name || ''
                  ).trim();
                  if (!desc) return null;

                  return (
                    <button
                      key={`${source.key}-${result?.id || `${desc}-${index}`}`}
                      type="button"
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        textAlign: 'left',
                        background: 'rgba(103, 232, 249, 0.06)',
                        border: 'none',
                        borderBottom: '1px solid #2a2a2a',
                        color: '#e2e8f0',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                      }}
                      onMouseDown={() => onSelectCatalogResult(result, desc)}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {renderFoodOptionLabel(desc, foodNameInput, result?.id || desc)}
                        {result?.sourceBadgeLabel ? (
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              padding: '2px 6px',
                              borderRadius: 6,
                              background: result?.foodSource === 'USDA' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(34, 197, 94, 0.18)',
                              color: result?.foodSource === 'USDA' ? '#94a3b8' : '#4ade80',
                            }}
                          >
                            {result.sourceBadgeLabel}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
      <button
        type="button"
        title={foodNameInput.trim() ? `Genera con AI: "${foodNameInput.trim()}"` : 'Inserisci un nome per generare con AI'}
        disabled={isGeneratingFood || !foodNameInput.trim()}
        onMouseDown={() => {
          if (!isGeneratingFood && foodNameInput.trim()) onGenerateWithAi();
        }}
        style={{
          width: '100%',
          padding: '12px 16px',
          textAlign: 'left',
          background: 'rgba(179, 136, 255, 0.14)',
          border: 'none',
          borderTop: '1px solid #2a2a2a',
          color: '#e9d5ff',
          cursor: isGeneratingFood || !foodNameInput.trim() ? 'not-allowed' : 'pointer',
          fontSize: '0.9rem',
          fontWeight: 600,
          opacity: isGeneratingFood || !foodNameInput.trim() ? 0.55 : 1,
        }}
      >
        {isGeneratingFood ? '⏳ Generazione AI in corso...' : '✨ Genera con AI'}
      </button>
    </div>
  );
}
