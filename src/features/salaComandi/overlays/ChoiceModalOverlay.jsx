import React from 'react';
import AddEventMenuGrid from '../../../components/AddEventMenuGrid';
import { COFFEE_TYPE_OPTIONS, readLastCoffeeType } from '../../stimulants/coffeeLogEngine.js';
import { TEA_TYPE_OPTIONS, readLastTeaType } from '../../stimulants/teaLogEngine.js';
import { ENERGY_TYPE_OPTIONS, readLastEnergyType } from '../../stimulants/energyDrinkLogEngine.js';

const CHIP_ROW_STYLE = {
  display: 'flex',
  gap: '8px',
  marginBottom: '16px',
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  paddingBottom: '4px',
  scrollbarWidth: 'thin',
};

function VariantChipRow({
  label,
  options,
  value,
  onChange,
  ariaLabel,
}) {
  return (
    <>
      <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#aaa' }}>{label}</p>
      <div role="listbox" aria-label={ariaLabel || label} style={CHIP_ROW_STYLE}>
        {options.map((opt) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onChange?.(opt.id)}
              style={{
                flex: '0 0 auto',
                padding: '8px 14px',
                borderRadius: '999px',
                border: selected ? '2px solid #f59e0b' : '1px solid #333',
                background: selected ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.05)',
                color: selected ? '#fbbf24' : '#fff',
                fontSize: '0.8rem',
                fontWeight: selected ? 'bold' : 'normal',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '2px',
              }}
            >
              <span>{opt.label}</span>
              {opt.hint ? (
                <span style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 'normal' }}>
                  {opt.hint}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
}

function SugarChoiceRow({ coffeeVariant, setCoffeeVariant, amaroHint = 'Digiuno OK' }) {
  return (
    <>
      <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#aaa' }}>Preparazione</p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {[
          { id: 'amaro', label: 'Amaro (0 kcal)', hint: amaroHint },
          { id: 'zuccherato', label: 'Zuccherato (+20 kcal)', hint: 'Rompe digiuno' },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setCoffeeVariant?.(opt.id)}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '12px',
              border: coffeeVariant === opt.id ? '2px solid #06b6d4' : '1px solid #333',
              background: coffeeVariant === opt.id ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.05)',
              color: coffeeVariant === opt.id ? '#67e8f9' : '#fff',
              fontSize: '0.8rem',
              fontWeight: coffeeVariant === opt.id ? 'bold' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span>{opt.label}</span>
            <span style={{ fontSize: '0.7rem', opacity: 0.75 }}>{opt.hint}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export default function ChoiceModalOverlay({
  showChoiceModal,
  onClose,
  addChoiceView,
  onBackToMain,
  stimulantSubtype,
  setStimulantSubtype,
  coffeeType,
  setCoffeeType,
  teaType,
  setTeaType,
  energyType,
  setEnergyType,
  coffeeVariant,
  setCoffeeVariant,
  stimulantTime,
  setStimulantTime,
  onSaveStimulant,
  addEventMenuOrder,
  commitAddEventMenuOrder,
  handleAddEventMenuItem,
}) {
  if (!showChoiceModal) return null;

  const isCoffee = stimulantSubtype === 'caffè';
  const isTea = stimulantSubtype === 'tè';
  const isEnergy = stimulantSubtype === 'energy drink';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100020, padding: '15px' }} onClick={onClose}>
      <div style={{ background: '#111', border: '1px solid #333', borderRadius: '25px', padding: '20px', width: '100%', maxWidth: '350px', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 10px 50px rgba(0,0,0,0.9)' }} onClick={(e) => e.stopPropagation()}>
        {addChoiceView === 'stimulant' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <button type="button" onClick={onBackToMain} style={{ background: 'none', border: 'none', color: '#888', fontSize: '0.9rem', cursor: 'pointer' }}>← Indietro</button>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1rem', letterSpacing: '1px' }}>☕ Sostanza energizzante</h3>
              <div style={{ width: '70px' }} />
            </div>
            <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#aaa' }}>Categoria</p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {['caffè', 'tè', 'energy drink'].map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => {
                    setStimulantSubtype(sub);
                    if (sub === 'caffè') setCoffeeType?.(readLastCoffeeType());
                    if (sub === 'tè') setTeaType?.(readLastTeaType());
                    if (sub === 'energy drink') setEnergyType?.(readLastEnergyType());
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '12px',
                    border: stimulantSubtype === sub ? '2px solid #f59e0b' : '1px solid #333',
                    background: stimulantSubtype === sub ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                    color: stimulantSubtype === sub ? '#f59e0b' : '#fff',
                    fontSize: '0.85rem',
                    fontWeight: stimulantSubtype === sub ? 'bold' : 'normal',
                    cursor: 'pointer',
                  }}
                >
                  {sub === 'caffè' ? '☕ Caffè' : sub === 'tè' ? '🍵 Tè' : '🥤 Energy'}
                </button>
              ))}
            </div>
            {isCoffee ? (
              <>
                <VariantChipRow
                  label="Variante"
                  ariaLabel="Tipo di caffè"
                  options={COFFEE_TYPE_OPTIONS}
                  value={coffeeType}
                  onChange={setCoffeeType}
                />
                <SugarChoiceRow coffeeVariant={coffeeVariant} setCoffeeVariant={setCoffeeVariant} />
              </>
            ) : null}
            {isTea ? (
              <>
                <VariantChipRow
                  label="Variante"
                  ariaLabel="Tipo di tè"
                  options={TEA_TYPE_OPTIONS}
                  value={teaType}
                  onChange={setTeaType}
                />
                <SugarChoiceRow coffeeVariant={coffeeVariant} setCoffeeVariant={setCoffeeVariant} />
              </>
            ) : null}
            {isEnergy ? (
              <VariantChipRow
                label="Variante"
                ariaLabel="Tipo di energy drink"
                options={ENERGY_TYPE_OPTIONS}
                value={energyType}
                onChange={setEnergyType}
              />
            ) : null}
            <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#aaa' }}>Orario</p>
            <input type="range" min={0} max={24} step={0.25} value={stimulantTime} onChange={(e) => setStimulantTime(Number(e.target.value))} style={{ width: '100%', marginBottom: '8px' }} />
            <span style={{ fontSize: '0.9rem', color: '#00e5ff', marginBottom: '16px' }}>{Math.floor(stimulantTime)}:{String(Math.round((stimulantTime % 1) * 60)).padStart(2, '0')}</span>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSaveStimulant?.(event);
              }}
              style={{ padding: '14px', background: '#f59e0b', color: '#000', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Salva
            </button>
          </>
        ) : (
          <AddEventMenuGrid
            menuOrder={addEventMenuOrder}
            onOrderCommit={commitAddEventMenuOrder}
            onItemActivate={(id) => handleAddEventMenuItem(id, 'modal')}
            title="AGGIUNGI EVENTO"
            headingStyle={{ marginBottom: 0 }}
          />
        )}
      </div>
    </div>
  );
}
