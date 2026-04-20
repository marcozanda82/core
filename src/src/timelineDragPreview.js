/**
 * Clona input di simulazione energetica spostando l’orario di un nodo timeline,
 * con la stessa logica di commit di `updateMealTime` in SalaComandi (senza mutare lo stato).
 *
 * @param {string|number} nodeId
 * @param {number} newHourRaw ore decimali 0–24
 * @param {object[]} nodesForEnergySimulation nodi passati a generateRealEnergyData (+ sleep sintetico)
 * @param {object[]} dailyLogForEnergy log giornaliero (stesso di energy sim)
 * @param {(log: object[], slot: string) => object[]} getFoodItemsForMealSlot
 * @param {object[]} manualNodes nodi manuali (per distinguere branch pasto vs manuale)
 * @returns {{ nodes: object[], log: object[] } | null}
 */
export function applyTimelineStripHourToPreviewInputs(
  nodeId,
  newHourRaw,
  nodesForEnergySimulation,
  dailyLogForEnergy,
  getFoodItemsForMealSlot,
  manualNodes
) {
  const t = Number(newHourRaw);
  if (!Number.isFinite(t)) return null;
  const finalTimeRounded = Math.max(0, Math.min(24, Math.round(t * 12) / 12));
  const dragId = nodeId;
  const idMatch = (a, b) => a === b || String(a) === String(b);

  const mn = Array.isArray(manualNodes) ? manualNodes : [];
  const baseNodes = Array.isArray(nodesForEnergySimulation) ? nodesForEnergySimulation : [];
  const baseLog = Array.isArray(dailyLogForEnergy) ? dailyLogForEnergy : [];

  const nodes = baseNodes.map((n) => ({ ...n }));
  let log = baseLog.map((e) => ({ ...e }));

  if (mn.some((n) => idMatch(n.id, dragId))) {
    for (let i = 0; i < nodes.length; i++) {
      if (!idMatch(nodes[i].id, dragId)) continue;
      const node = nodes[i];
      if (node.type === 'work' || node.type === 'cognitive') {
        nodes[i] = { ...node, time: finalTimeRounded };
      } else {
        nodes[i] = { ...node, time: finalTimeRounded, mealTime: finalTimeRounded };
      }
    }
    nodes.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    return { nodes, log };
  }

  const ghost = log.find((item) => idMatch(item.id, dragId) && item.type === 'ghost_meal');
  if (ghost) {
    log = log.map((item) =>
      idMatch(item.id, dragId) && item.type === 'ghost_meal'
        ? { ...item, mealTime: finalTimeRounded, time: finalTimeRounded }
        : item
    );
    for (let i = 0; i < nodes.length; i++) {
      if (idMatch(nodes[i].id, dragId)) {
        nodes[i] = { ...nodes[i], time: finalTimeRounded, mealTime: finalTimeRounded };
      }
    }
    nodes.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    return { nodes, log };
  }

  const mealSlotForDrag = String(dragId);
  const items = typeof getFoodItemsForMealSlot === 'function' ? getFoodItemsForMealSlot(log, mealSlotForDrag) : [];
  const itemIds = (items || []).map((i) => i.id).filter((id) => id != null);
  if (itemIds.length === 0) return null;

  const idSet = new Set(itemIds.map((x) => String(x)));
  log = log.map((item) =>
    idSet.has(String(item.id)) ? { ...item, mealTime: finalTimeRounded } : item
  );
  for (let i = 0; i < nodes.length; i++) {
    if (idMatch(nodes[i].id, dragId)) {
      nodes[i] = { ...nodes[i], time: finalTimeRounded };
    }
  }
  nodes.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  return { nodes, log };
}
