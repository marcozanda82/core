/**
 * Organizza l'edizione scritta Focus nelle tre sezioni coach del prodotto.
 * Non inventa testi: riorganizza solo articoli/coach già prodotti dalla pipeline.
 */

/**
 * @param {object|null|undefined} article
 */
function slimArticle(article) {
  if (!article || typeof article !== 'object') return null;
  const metrics = Array.isArray(article.metricsCited) ? article.metricsCited : [];
  const provenanceTags = [];
  for (const m of metrics) {
    const p = String(m?.provenance || '').trim();
    if (p && !provenanceTags.includes(p)) provenanceTags.push(p);
  }
  return {
    id: article.id || null,
    role: article.role || null,
    title: String(article.title || '').trim(),
    body: String(article.body || '').trim(),
    cautions: Array.isArray(article.cautions) ? article.cautions.filter(Boolean) : [],
    evidenceIds: Array.isArray(article.evidenceIds) ? article.evidenceIds : [],
    metricsCited: metrics,
    provenanceTags,
    hasRecordedMetrics: metrics.some((m) => m?.provenance === 'recorded'),
    hasEstimatedMetrics: metrics.some((m) => m?.provenance === 'estimated'),
    hasMissingEvidence: (article.evidenceIds || []).length === 0,
  };
}

/**
 * Card primaria: preferisce pezzi specifici del periodo rispetto al solo lead ripetuto.
 * @param {object[]} items
 * @param {'bene'|'attenzione'|'migliora'} sectionId
 */
function pickPrimaryItem(items, sectionId) {
  if (!items.length) return null;
  if (sectionId === 'migliora') {
    const centerpiece = items.find((i) => i.role === 'centerpiece');
    if (centerpiece) return centerpiece;
    const feature = items.find((i) => i.role === 'feature');
    if (feature) return feature;
    return items.find((i) => !i.isCoach) || items[0];
  }
  if (sectionId === 'bene') {
    const good = items.find((i) => i.role === 'good');
    if (good) return good;
    return items[0];
  }
  return items[0];
}

/**
 * @param {{ written?: object|null, selection?: object|null }} input
 */
export function mapWrittenEditionToCoachSections(input) {
  const written = input?.written || null;
  const selection = input?.selection || null;
  const articles = Array.isArray(written?.articles) ? written.articles : [];

  /** @type {ReturnType<typeof slimArticle>[]} */
  const bene = [];
  /** @type {ReturnType<typeof slimArticle>[]} */
  const attenzione = [];
  /** @type {ReturnType<typeof slimArticle>[]} */
  const migliora = [];
  /** @type {ReturnType<typeof slimArticle>[]} */
  const deepen = [];

  for (const raw of articles) {
    const item = slimArticle(raw);
    if (!item || (!item.title && !item.body)) continue;
    deepen.push(item);
    const role = item.role;

    if (role === 'good') {
      bene.push(item);
      continue;
    }
    if (role === 'concern') {
      attenzione.push(item);
      continue;
    }
    if (role === 'feature') {
      migliora.push(item);
      continue;
    }
    if (role === 'centerpiece') {
      migliora.push(item);
      continue;
    }
    if (role === 'lead') {
      const tone = String(selection?.lead?.tone || raw.tone || '').toLowerCase();
      if (tone === 'caution' || tone === 'concern') attenzione.push(item);
      else bene.push(item);
      continue;
    }
    migliora.push(item);
  }

  /** @type {object|null} */
  let coachAdvice = null;
  if (written?.coach && written.coach.templateId !== 'NONE') {
    const coachBody = String(written.coach.body || '').trim();
    const coachTitle = String(written.coach.title || 'Nota del coach').trim();
    if (coachBody || coachTitle) {
      coachAdvice = {
        id: written.coach.id || 'coach',
        templateId: written.coach.templateId || null,
        title: coachTitle,
        body: coachBody,
      };
    }
  }

  const sections = {
    bene: {
      id: 'bene',
      title: 'Cosa stai facendo bene',
      cardLabel: 'Bene',
      emptyLabel: 'Nessun segnale positivo supportato dai dati in questa edizione.',
      items: bene,
      primary: pickPrimaryItem(bene, 'bene'),
    },
    attenzione: {
      id: 'attenzione',
      title: 'Dove prestare attenzione',
      cardLabel: 'Attenzione',
      emptyLabel: 'Nessun punto di attenzione supportato dai dati in questa edizione.',
      items: attenzione,
      primary: pickPrimaryItem(attenzione, 'attenzione'),
    },
    migliora: {
      id: 'migliora',
      title: 'Cosa fare ora',
      cardLabel: 'Cosa fare ora',
      emptyLabel: 'Nessun suggerimento fondato sui dati in questa edizione.',
      items: migliora,
      primary: pickPrimaryItem(migliora, 'migliora'),
    },
  };

  return {
    // Non usare come titolo hero della dashboard: spesso è il lead ripetuto tra periodi.
    mastheadTeaser: String(written?.mastheadTeaser || '').trim() || null,
    openingMode: written?.openingMode || null,
    proseSource: written?.proseSource || null,
    analysisDate: written?.analysisDate || null,
    publicationDate: written?.publicationDate || null,
    coachAdvice,
    deepenArticles: deepen,
    sections,
  };
}
