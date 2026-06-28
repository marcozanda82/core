import React from 'react';
import MetabolicStatusBadge from '../components/MetabolicStatusBadge';

/**
 * Testata dashboard: logo | navigazione data | cruscotto metabolico + accessory + SNC.
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
  metabolicSnapshot,
  onMetabolicBadgeClick,
  simulationActive,
  onExitSimulation,
  accessory,
}) {
  return (
    <>
      <div className="mb-2 box-border flex w-full items-center justify-between gap-2 px-1 pb-2">
        {/* Sinistra: logo + navigazione data */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onLogoClick}
            className="m-0 flex max-w-[min(46vw,168px)] shrink-0 cursor-pointer items-center justify-start border-none bg-transparent p-0.5 px-1"
          >
            <img
              src="/nuovo%20logo%20trasparente2.png"
              alt="Kentuos Logo"
              decoding="async"
              draggable={false}
              className="block h-auto max-h-[52px] w-auto max-w-full object-contain object-left"
            />
          </button>
          <div className="flex min-w-0 flex-nowrap items-center gap-1">
            <button
              type="button"
              onClick={onPrevDay}
              className="flex shrink-0 cursor-pointer items-center border-none bg-transparent p-1.5 text-[#00e5ff] text-[1.1rem]"
              aria-label="Giorno precedente"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={onOpenCalendar}
              className="cursor-pointer truncate border-none bg-transparent px-1.5 text-center text-[0.85rem] font-bold whitespace-nowrap text-white"
              aria-label="Apri calendario storico"
              title="Apri calendario storico"
            >
              {dateLabel}
            </button>
            <button
              type="button"
              onClick={onNextDay}
              disabled={nextDayDisabled}
              className="flex shrink-0 items-center border-none bg-transparent p-1.5 text-[1.1rem] text-[#00e5ff] disabled:cursor-default disabled:opacity-30"
              aria-label="Giorno successivo"
            >
              ▶
            </button>
          </div>
        </div>

        {/* Destra: badge metabolico + accessory + SNC */}
        <div className="ml-auto flex shrink-0 items-center justify-end gap-2 sm:gap-3">
          <MetabolicStatusBadge
            metabolicSnapshot={metabolicSnapshot}
            onClick={onMetabolicBadgeClick}
          />
          {accessory ? (
            <div className="flex shrink-0 items-center">{accessory}</div>
          ) : null}
          {sncStressLevel > 65 && (
            <button
              type="button"
              onClick={onSncStressClick}
              title={sncStressLevel >= 85 ? 'Allarme overtraining SNC' : 'Affaticamento SNC'}
              aria-label={sncStressLevel >= 85 ? 'Allarme overtraining SNC' : 'Affaticamento SNC'}
              className="shrink-0 border-none bg-transparent p-1 text-[1.15rem] leading-none"
              style={{
                animation: sncStressLevel >= 85 ? 'pulseDot 1.5s infinite ease-in-out' : 'none',
              }}
            >
              {sncStressLevel >= 85 ? '⚠️' : '⚡'}
            </button>
          )}
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
