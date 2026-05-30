import { useCallback, useEffect, useState } from 'react';
import {
  applyCalorieStrategyToProfileKcal,
  getTodayString,
  normalizeMealFoodsArray,
} from '../coreEngine';
import { collectDispensaProbableFoods } from '../features/salaComandi/utils/aiContextUtils';
import { parsePlanMealDraftAiResponse } from '../features/salaComandi/utils/foodUtils';
import { callGeminiAPIWithRotation } from '../services/aiService';

/**
 * Verifica alimenti + generazione draft ghost meal (piano) via BFF Firebase.
 */
export function useAiCoachActions({
  editFoodData,
  setEditFoodData,
  setIsAIVerifying,
  callGeminiAPIWithRotationRef,
  activeLog,
  currentTrackerDate,
  foodDb,
  fullHistory,
  kentuDailyCalorieStrategy,
  userTargets,
  buildLast7DaysMealLinesForDraftPrompt,
  buildAiMealConstraintsPromptBlock,
  buildRecentMealsContextForDinner,
}) {
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    callGeminiAPIWithRotationRef.current = callGeminiAPIWithRotation;
  }, [callGeminiAPIWithRotationRef]);

  const handleVerifyFoodAI = useCallback(async () => {
    if (!editFoodData || !(editFoodData.name || editFoodData.nome || editFoodData.desc)) return;
    setIsAIVerifying(true);
    try {
      const prompt = `Agisci come un nutrizionista esperto. Verifica i seguenti valori nutrizionali per l'alimento "${editFoodData.name || editFoodData.nome || editFoodData.desc}" (Quantità: ${editFoodData.qty ?? editFoodData.weight ?? 100}g/ml).
Valori attuali: Calorie: ${editFoodData.kcal ?? editFoodData.cal ?? 0}, Proteine: ${editFoodData.prot ?? editFoodData.proteine ?? 0}g, Carboidrati: ${editFoodData.carb ?? editFoodData.carboidrati ?? 0}g, Grassi: ${editFoodData.fat ?? editFoodData.fatTotal ?? 0}g, Fibre: ${editFoodData.fibre ?? 0}g.
Controlla se i macro sono coerenti con le calorie (ricorda: 1g prot=4kcal, 1g carb=4kcal, 1g fat=9kcal). Se ci sono errori palesi o i valori sono implausibili per questa quantità, correggili con i valori medi reali.
RISPONDI SOLO CON UN OGGETTO JSON VALIDO, senza markdown, con queste esatte chiavi: {"kcal": numero, "prot": numero, "carb": numero, "fat": numero, "fibre": numero}`;
      const aiResponseText = await callGeminiAPIWithRotation(prompt);
      const cleanJsonStr = (aiResponseText || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      const correctedValues = JSON.parse(cleanJsonStr);
      setEditFoodData((prev) => ({
        ...prev,
        kcal: typeof correctedValues.kcal === 'number' ? correctedValues.kcal : (prev.kcal ?? prev.calorie ?? prev.cal),
        prot: typeof correctedValues.prot === 'number' ? correctedValues.prot : (prev.prot ?? prev.proteine),
        carb: typeof correctedValues.carb === 'number' ? correctedValues.carb : (prev.carb ?? prev.carboidrati),
        fat: typeof correctedValues.fat === 'number' ? correctedValues.fat : (prev.fat ?? prev.fatTotal ?? prev.grassi),
        fibre: typeof correctedValues.fibre === 'number' ? correctedValues.fibre : (prev.fibre ?? 0),
      }));
      alert('Valori verificati e aggiornati dall\'AI. Controllali e premi "Salva Modifiche".');
    } catch (error) {
      console.error('Errore verifica AI:', error);
      alert("Impossibile verificare con l'AI in questo momento.");
    } finally {
      setIsAIVerifying(false);
    }
  }, [editFoodData, setEditFoodData, setIsAIVerifying]);

  const handleGeneratePlanGhostMealDraft = useCallback(
    async ({
      mealType,
      time,
      title,
      microDesc,
      planTarget,
      aiMealConstraints,
      manualFoods,
      mealMacroResidual,
      mealMacroTargetTotal,
    }) => {
      const manualNorm = normalizeMealFoodsArray(manualFoods);
      const cov =
        manualNorm.length > 0
          ? manualNorm.reduce(
              (a, f) => ({
                kcal: a.kcal + (Number(f.kcal) || 0),
                prot: a.prot + (Number(f.prot) || 0),
                carb: a.carb + (Number(f.carb) || 0),
                fat: a.fat + (Number(f.fat) || 0),
              }),
              { kcal: 0, prot: 0, carb: 0, fat: 0 }
            )
          : null;
      const mt = mealMacroTargetTotal || {};
      const mr = mealMacroResidual || {};
      const manualBlock =
        manualNorm.length > 0
          ? `

ALIMENTI GIÀ INSERITI DALL'UTENTE (fissi: non modificare grammi, non rimuovere, non ripetere nel JSON):
${manualNorm.map((f) => `- ${f.qty}g ${f.name}`).join('\n')}

Target pasto complessivo (riferimento motore): ~${Math.round(Number(mt.kcal) || 0)} kcal, P${mt.prot}g, C${mt.carb}g, F${mt.fat}g.
Macro stimate dai fissi (se note): ~${Math.round(cov.kcal)} kcal, P${cov.prot.toFixed(1)}g, C${cov.carb.toFixed(1)}g, F${cov.fat.toFixed(1)}g.
RESIDUO da colmare SOLO con nuove voci nell'array "items" (o in draftFoods se usi il formato legacy): ~${Math.round(Number(mr.kcal) || 0)} kcal, P${mr.prot}g, C${mr.carb}g, F${mr.fat}g.

REGOLE CON FISSI:
- "items" / draftFoods devono contenere SOLO alimenti AGGIUNTIVI (nessun nome uguale o equivalente ai fissi).
- Se il residuo è trascurabile (es. kcal ≤ 30 e ogni macro residua ≤ 3 g), restituisci aggiunte vuote: {"items":[]} o draftFoods [].
- Se il residuo non è trascurabile: almeno 1 nuova voce, massimo 10 nuove voci.
`
          : '';

      const anchor = currentTrackerDate || getTodayString();
      const burnedKcalContext = (activeLog || [])
        .filter((item) => item && item.type === 'workout')
        .reduce((acc, wk) => acc + (Number(wk.kcal || wk.cal) || 0), 0);
      const dynamicKcal =
        applyCalorieStrategyToProfileKcal(userTargets?.kcal ?? 2000, kentuDailyCalorieStrategy) + burnedKcalContext;
      const recent7 = buildLast7DaysMealLinesForDraftPrompt(fullHistory, anchor);
      const storicoBreve = buildRecentMealsContextForDinner(fullHistory, anchor);
      const dispensa = collectDispensaProbableFoods(fullHistory, anchor, 18, 7);
      const dbKeys = Object.keys(foodDb || {})
        .slice(0, 45)
        .join(', ');
      const oggiBreve = (activeLog || [])
        .filter((e) => e && (e.type === 'food' || e.type === 'recipe') && !e.isGhost)
        .map((e) => `${e.desc || e.title || '?'} (~${Math.round(Number(e.kcal || e.cal) || 0)} kcal)`)
        .slice(0, 20)
        .join('; ');
      const constraintsBlock = buildAiMealConstraintsPromptBlock(aiMealConstraints);
      const minVociRule =
        manualNorm.length > 0
          ? 'Con alimenti fissi: solo aggiunte nel JSON (vedi blocco sotto). Senza fissi: minimo 2 voci, massimo 10.'
          : 'Minimo 2 voci, massimo 10.';
      const prompt = `Sei Kentu (nutrizionista operativo). Rispondi SOLO con un JSON valido su una riga o un blocco, senza testo prima o dopo, senza markdown.
Formato preferito (voci strutturate con stime):
{"items":[{"name":"Riso basmati","qty":200,"estKcal":260,"estPro":5,"estCar":58,"estFat":0.6,"dbKey":""}]}
(dbKey opzionale: chiave da database se nota; altrimenti stringa vuota)

Formato legacy accettato:
{"draftFoods":["200g Riso basmati","120g Petto di pollo","10g Olio EVO"]}

Pasto pianificato (slot):
- mealType: ${String(mealType || '')}
- orario: ${String(time || '')}
- titolo: ${String(title || '')}
- microDesc / focus: ${String(microDesc || '')}
- target strategia giornata: ${String(planTarget || 'pari')}
- kcal giornaliere di riferimento (adattate): ~${Math.round(dynamicKcal)}

Gerarchia obbligatoria: (1) ultimi 3-7 giorni pasti simili; (2) storico più lungo; (3) dispensa + database; (4) combinazione nuova solo se necessario.
Ogni voce deve essere "grammi + nome" (es. 150g Tofu). ${minVociRule}
${constraintsBlock}
${manualBlock}

ULTIMI 7 GIORNI:
${recent7}

STORICO PASTI (sintesi 30gg):
${String(storicoBreve).slice(0, 2200)}

DISPENSA PROBABILE:
${dispensa}

OGGI GIÀ REGISTRATO:
${oggiBreve || 'niente'}

CHIAVI DB (subset):
${dbKeys || 'n/d'}`;

      const raw = await callGeminiAPIWithRotation(prompt);
      try {
        return parsePlanMealDraftAiResponse(raw);
      } catch (e) {
        throw new Error(e?.message ? `JSON non valido: ${e.message}` : 'Risposta AI non valida (piano pasto)');
      }
    },
    [
      activeLog,
      currentTrackerDate,
      foodDb,
      fullHistory,
      kentuDailyCalorieStrategy,
      userTargets,
      buildLast7DaysMealLinesForDraftPrompt,
      buildAiMealConstraintsPromptBlock,
      buildRecentMealsContextForDinner,
    ]
  );

  return {
    isAiLoading,
    setIsAiLoading,
    callGeminiAPIWithRotation,
    handleVerifyFoodAI,
    handleGeneratePlanGhostMealDraft,
  };
}
