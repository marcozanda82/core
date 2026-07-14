/** Barra progresso nutriente (telemetria giornaliera). */
export function NutrientProgressBar({
  label,
  current,
  target,
  unit = 'g',
  nutrientKey = null,
  onNutrientClick,
}) {
  const c = Number(current) ?? 0;
  const t = Number(target) ?? 0;
  const p = t > 0 ? Math.min((c / t) * 100, 100) : 0;
  const color = p >= 100 ? '#00e676' : p > 50 ? '#00e5ff' : '#ff6d00';
  return (
    <div
      style={{ marginBottom: '12px', cursor: nutrientKey ? 'pointer' : 'default', transition: 'transform 0.2s' }}
      onClick={() => nutrientKey && onNutrientClick?.({ label, key: nutrientKey, target: t, unit, isWeekly: false })}
      onMouseEnter={(e) => nutrientKey && (e.currentTarget.style.transform = 'scale(1.02)')}
      onMouseLeave={(e) => nutrientKey && (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#aaa', marginBottom: '4px' }}>
        <span>{label}</span>
        <span>{Math.round(c)} / {Math.round(t)} {unit}</span>
      </div>
      <div style={{ height: '12px', background: '#333', borderRadius: '6px', overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: color, borderRadius: '6px', transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

/** Barra rapporto tra due nutrienti (es. Na/K, Omega 6:3). */
export function NutrientRatioBar({
  title,
  labelA,
  valA,
  labelB,
  valB,
  idealText,
  isGood,
}) {
  const vA = Number(valA) || 0;
  const vB = Number(valB) || 0;
  const total = vA + vB;
  const percentA = total > 0 ? (vA / total) * 100 : 50;
  return (
    <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#aaa', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
        <span>{title}</span>
        <span style={{ color: isGood ? '#00e676' : '#ffea00' }}>{idealText}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px', fontWeight: 'bold' }}>
        <span style={{ color: '#ff6d00' }}>{labelA}: {Math.round(vA)}</span>
        <span style={{ color: '#00e5ff' }}>{labelB}: {Math.round(vB)}</span>
      </div>
      <div style={{ height: '8px', background: '#00e5ff', borderRadius: '4px', overflow: 'hidden', display: 'flex', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
        <div style={{ width: `${percentA}%`, background: '#ff6d00', transition: 'width 0.5s', borderRight: '2px solid #111' }} />
      </div>
    </div>
  );
}

/** Barra progresso nutriente su base settimanale (7× target giornaliero). */
export function WeeklyNutrientBar({
  label,
  current,
  dailyTarget,
  unit,
  nutrientKey = null,
  onNutrientClick,
}) {
  const target = (Number(dailyTarget) || 1) * 7;
  const percent = Math.min((current / target) * 100, 100);
  const isOver = current > target * 1.5;
  return (
    <div
      key={label}
      style={{ marginBottom: '10px', cursor: nutrientKey ? 'pointer' : 'default', transition: 'transform 0.2s' }}
      onClick={() => nutrientKey && onNutrientClick?.({ label, key: nutrientKey, target, unit, isWeekly: true })}
      onMouseEnter={(e) => nutrientKey && (e.currentTarget.style.transform = 'scale(1.02)')}
      onMouseLeave={(e) => nutrientKey && (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#888', marginBottom: '4px', textTransform: 'uppercase' }}>
        <span>{label}</span>
        <span style={{ color: isOver ? '#ff3d00' : '#ccc' }}>{Math.round(current)} / {Math.round(target)} {unit}</span>
      </div>
      <div style={{ height: '5px', background: '#222', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: isOver ? '#ff3d00' : (percent >= 100 ? '#00e676' : '#b388ff'), transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

/** Factory compatibile con pattern render-function legacy. */
export function createNutrientProgressBarRenderer(onNutrientClick) {
  return (label, current, target, unit = 'g', nutrientKey = null) => (
    <NutrientProgressBar
      label={label}
      current={current}
      target={target}
      unit={unit}
      nutrientKey={nutrientKey}
      onNutrientClick={onNutrientClick}
    />
  );
}

export function createNutrientRatioBarRenderer() {
  return (title, labelA, valA, labelB, valB, idealText, isGood) => (
    <NutrientRatioBar
      title={title}
      labelA={labelA}
      valA={valA}
      labelB={labelB}
      valB={valB}
      idealText={idealText}
      isGood={isGood}
    />
  );
}

export function createWeeklyNutrientBarRenderer(onNutrientClick) {
  return (label, current, dailyTarget, unit, nutrientKey = null) => (
    <WeeklyNutrientBar
      label={label}
      current={current}
      dailyTarget={dailyTarget}
      unit={unit}
      nutrientKey={nutrientKey}
      onNutrientClick={onNutrientClick}
    />
  );
}
