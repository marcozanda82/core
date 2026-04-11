import React from 'react';
import { MACRO_KEYS } from './constants';
import './InsightCard.css';

/**
 * Genera diagnosi macro: eccesso proteico, carenza carboidrati, etc.
 */
function getDiagnosi(target, real) {
  const out = [];
  if (real.prot > target.prot * 1.15 && target.prot > 0)
    out.push('Eccesso Proteico');
  if (real.carb < target.carb * 0.85 && target.carb > 0)
    out.push('Carenza Carboidrati Complessi');
  if (real.fat > target.fat * 1.2 && target.fat > 0)
    out.push('Eccesso Grassi');
  if (real.fibre < target.fibre * 0.8 && target.fibre > 0)
    out.push('Fibre sotto target');
  return out.length ? out.join('. ') : 'Macro nella fascia accettabile';
}

/**
 * Spiegazione cortisolo: scostamento negativo = rischio picco cortisolo / ipoglicemia
 */
function getCortisoloText(scostamentoPerc) {
  if (scostamentoPerc < -10)
    return 'Rischio di picco di cortisolo e ipoglicemia reattiva: il digiuno prolungato o un pasto troppo leggero stimolano la risposta allo stress. Consiglio: distribuire meglio le calorie e preferire carboidrati a basso indice glicemico.';
  if (scostamentoPerc > 25)
    return 'Pasti molto abbondanti possono causare picchi glicemici e successivi cali; il cortisolo si stabilizza con pasti regolari e bilanciati.';
  return 'Aderenza nella norma: utile mantenere ritmo e qualità dei pasti per un profilo cortisolo stabile.';
}

/**
 * Azione correttiva sintetica (es. -15% pesce, +20g cereali)
 */
function getAzioneCorrettiva(target, real, scostamentoPerc) {
  const actions = [];
  if (real.prot > target.prot * 1.15 && target.prot > 0)
    actions.push('Ridurre quota proteica al pasto successivo (~-15% porzione proteica).');
  if (real.carb < target.carb * 0.85 && target.carb > 0)
    actions.push('Aggiungere ~20 g di cereali integrali (es. riso, pasta integrale) o una fetta di pane integrale.');
  if (scostamentoPerc < -10)
    actions.push('Inserire uno spuntino con carboidrati complessi e una fonte proteica per stabilizzare la glicemia.');
  if (real.fibre < target.fibre * 0.8 && target.fibre > 0)
    actions.push('Aumentare verdura e/o legumi; considerare 1 porzione di farro o orzo.');
  return actions.length ? actions.join(' ') : 'Mantenere le porzioni e la qualità attuali.';
}

export default function InsightCard({ mealLabel, target, real, scostamentoPerc, foodTips, onClose }) {
  const diagnosi = getDiagnosi(target, real);
  const cortisolo = getCortisoloText(scostamentoPerc);
  const azione = getAzioneCorrettiva(target, real, scostamentoPerc);
  const isCortisoloRisk = scostamentoPerc < -10;

  return (
    <div className="insight-card" role="dialog" aria-label={`Insight ${mealLabel}`}>
      <button type="button" className="insight-card-close" onClick={onClose} aria-label="Chiudi">
        ×
      </button>
      <h3 className="insight-card-title">{mealLabel}</h3>
      <p className="insight-card-scostamento">
        Scostamento calorico: <strong>{scostamentoPerc >= 0 ? '+' : ''}{scostamentoPerc.toFixed(1)}%</strong>
      </p>

      <section className="insight-card-section">
        <h4>Diagnosi</h4>
        <p>{diagnosi}</p>
      </section>

      <section className={`insight-card-section ${isCortisoloRisk ? 'cortisolo-risk' : ''}`}>
        <h4>Cortisolo & stabilità glicemica</h4>
        <p>{cortisolo}</p>
      </section>

      <section className="insight-card-section">
        <h4>Azione correttiva</h4>
        <p>{azione}</p>
      </section>

      {foodTips && foodTips.length > 0 && (
        <section className="insight-card-section insight-food-tip">
          <h4>Food Tip</h4>
          <p>{foodTips.join(' ')}</p>
        </section>
      )}
    </div>
  );
}
