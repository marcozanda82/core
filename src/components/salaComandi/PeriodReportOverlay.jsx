/**
 * Overlay stampabile: analisi carenze nutrizionali su periodo selezionabile.
 */

import { REPORT_NUTRIENT_KEYS } from '../../constants/salaComandiConstants';
import { getTargetForNutrient } from '../../useBiochimico';

const PERIOD_OPTIONS = [
  { val: '7', label: '1 Settimana' },
  { val: '30', label: '1 Mese' },
  { val: '90', label: '3 Mesi' },
  { val: '180', label: '6 Mesi' },
  { val: '365', label: '1 Anno' },
];

const NUTRIENT_LABELS = {
  kcal: 'Kcal',
  prot: 'Proteine (g)',
  carb: 'Carboidrati (g)',
  fatTotal: 'Grassi (g)',
  fibre: 'Fibre (g)',
  vitc: 'Vit. C (mg)',
  vitD: 'Vit. D (µg)',
  omega3: 'Omega 3 (g)',
  mg: 'Magnesio (mg)',
  k: 'Potassio (mg)',
  fe: 'Ferro (mg)',
  ca: 'Calcio (mg)',
};

/**
 * @param {{
 *   open?: boolean,
 *   reportPeriod?: string,
 *   onReportPeriodChange?: (val: string) => void,
 *   onClose?: () => void,
 *   generateReportData?: () => ({ daysFound: number, averages: Record<string, number> }|null),
 *   userTargets?: object|null,
 * }} props
 */
export default function PeriodReportOverlay({
  open = false,
  reportPeriod = '7',
  onReportPeriodChange = null,
  onClose = null,
  generateReportData = null,
  userTargets = null,
}) {
  if (!open) return null;

  const data = typeof generateReportData === 'function' ? generateReportData() : null;

  return (
    <div className="report-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: '#fff', color: '#000', zIndex: 100020, overflowY: 'auto', padding: '20px' }}>
      <div className="report-no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', background: '#f0f0f0', padding: '15px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.val}
              type="button"
              onClick={() => onReportPeriodChange?.(p.val)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                background: reportPeriod === p.val ? '#0d47a1' : '#ccc',
                color: reportPeriod === p.val ? '#fff' : '#000',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={() => window.print()}
            style={{ padding: '8px 16px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <img src="/icon-pdf-32.png" alt="" width={20} height={20} decoding="async" style={{ objectFit: 'contain' }} />
            Stampa PDF
          </button>
          <button
            type="button"
            onClick={() => onClose?.()}
            style={{ padding: '8px 16px', background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Chiudi
          </button>
        </div>
      </div>

      <div className="report-print-area">
        <h1 style={{ borderBottom: '2px solid #0d47a1', paddingBottom: '10px' }}>Analisi Carenze Nutrizionali - Core</h1>
        <p><strong>Periodo analizzato:</strong> Ultimi {reportPeriod} giorni</p>

        {!data ? (
          <p>Nessun dato sufficiente in questo periodo.</p>
        ) : (
          <>
            <p><strong>Giorni con dati registrati:</strong> {data.daysFound} su {reportPeriod}</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Nutriente</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Media Assunta</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Target</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Stato</th>
                </tr>
              </thead>
              <tbody>
                {REPORT_NUTRIENT_KEYS.map((key) => {
                  const avg = data.averages[key];
                  const target = userTargets?.[key] ?? getTargetForNutrient(key);
                  if (target == null || target === 0) return null;

                  const percent = (avg / target) * 100;
                  const isDeficient = percent < 80;
                  const isWarning = percent >= 80 && percent < 95;

                  let statusColor = '#2e7d32';
                  let statusText = '✅ Ottimale';
                  if (isDeficient) { statusColor = '#d32f2f'; statusText = '❌ Carenza'; }
                  else if (isWarning) { statusColor = '#f57c00'; statusText = '⚠️ Attenzione'; }

                  return (
                    <tr key={key} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>{NUTRIENT_LABELS[key] || key}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{avg.toFixed(1)}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{target}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: statusColor, fontWeight: 'bold' }}>
                        {statusText} ({percent.toFixed(0)}%)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
