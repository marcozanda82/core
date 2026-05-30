import React from 'react';
import EnergyArc from '../components/EnergyArc';

/**
 * Testata dashboard: logo Core OS | navigazione data | stress SNC + Body Battery.
 * Banner simulazione opzionale sotto la prima riga.
 */
export default function AppHeader({
  onLogoClick,
  dateLabel,
  onPrevDay,
  onNextDay,
  onOpenCalendar,
  nextDayDisabled,
  sncStressLevel,
  onSncStressClick,
  bodyBattery,
  accentColor,
  onBatteryClick,
  simulationActive,
  onExitSimulation,
}) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          padding: '6px 4px 8px',
          marginBottom: '8px',
          gap: '6px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onLogoClick}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px 4px',
              margin: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              maxWidth: 'min(46vw, 168px)',
            }}
          >
            <img
              src="/nuovo%20logo%20trasparente2.png"
              alt="Kentuos Logo"
              decoding="async"
              draggable={false}
              style={{
                maxHeight: 52,
                height: 'auto',
                width: 'auto',
                maxWidth: '100%',
                objectFit: 'contain',
                objectPosition: 'left center',
                display: 'block',
              }}
            />
          </button>
        </div>
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
            <button
              type="button"
              onClick={onPrevDay}
              style={{
                background: 'none',
                border: 'none',
                color: '#00e5ff',
                fontSize: '1.1rem',
                padding: '6px',
                flexShrink: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label="Giorno precedente"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={onOpenCalendar}
              style={{
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                whiteSpace: 'nowrap',
                padding: '0 6px',
                textAlign: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
              aria-label="Apri calendario storico"
              title="Apri calendario storico"
            >
              {dateLabel}
            </button>
            <button
              type="button"
              onClick={onNextDay}
              disabled={nextDayDisabled}
              style={{
                background: 'none',
                border: 'none',
                color: '#00e5ff',
                fontSize: '1.1rem',
                padding: '6px',
                flexShrink: 0,
                cursor: nextDayDisabled ? 'default' : 'pointer',
                opacity: nextDayDisabled ? 0.3 : 1,
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label="Giorno successivo"
            >
              ▶
            </button>
          </div>
        </div>
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
          {sncStressLevel > 65 && (
            <button
              type="button"
              onClick={onSncStressClick}
              title={sncStressLevel >= 85 ? 'Allarme overtraining SNC' : 'Affaticamento SNC'}
              aria-label={sncStressLevel >= 85 ? 'Allarme overtraining SNC' : 'Affaticamento SNC'}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '1.15rem',
                cursor: 'pointer',
                padding: '4px',
                lineHeight: 1,
                animation: sncStressLevel >= 85 ? 'pulseDot 1.5s infinite ease-in-out' : 'none',
                flexShrink: 0,
              }}
            >
              {sncStressLevel >= 85 ? '⚠️' : '⚡'}
            </button>
          )}
          <div
            role="button"
            tabIndex={0}
            aria-label={`Body Battery ${bodyBattery?.currentEnergy ?? 0} per cento. Apri dettaglio.`}
            title="Body Battery — dettaglio"
            onClick={onBatteryClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onBatteryClick();
              }
            }}
            style={{
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            <EnergyArc
              percentage={bodyBattery?.currentEnergy ?? 0}
              size="small"
              hasNapBoost={!!bodyBattery?.hasNapBoost}
              showText
              textMode="energy"
              accentColor={accentColor ?? '#22d3ee'}
            />
          </div>
        </div>
      </div>

      {simulationActive && (
        <div
          style={{
            background: 'linear-gradient(90deg, #6200ea, #b388ff)',
            color: '#fff',
            padding: '8px 15px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontWeight: 'bold',
            fontSize: '0.9rem',
            boxShadow: '0 4px 15px rgba(98, 0, 234, 0.4)',
            zIndex: 100,
          }}
        >
          <span>🧪 MODALITÀ SIMULAZIONE ATTIVA</span>
          <button
            type="button"
            onClick={onExitSimulation}
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: 'none',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            ESCI ✖
          </button>
        </div>
      )}
    </>
  );
}
