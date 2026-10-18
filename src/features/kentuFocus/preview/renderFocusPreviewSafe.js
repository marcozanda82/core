/**
 * Overlay anteprima Focus — solo createElement / textContent / appendChild.
 * Nessun innerHTML di contenuti editoriali.
 */

/**
 * @param {Document} doc
 * @param {object} revisionDoc
 * @param {{
 *   publicationDate: string,
 *   analysisDate: string,
 *   proseSource?: string|null,
 *   missingNotes?: string[],
 * }} meta
 * @returns {{ root: HTMLElement, articleCount: number }}
 */
export function renderFocusPreviewSafe(doc, revisionDoc, meta) {
  doc.getElementById('kentu-focus-preview')?.remove();

  const root = doc.createElement('div');
  root.id = 'kentu-focus-preview';
  root.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#f4f1ea;color:#1a1a1a;overflow:auto;font:16px/1.5 Georgia,serif;padding:24px;';

  const close = doc.createElement('button');
  close.id = 'kentu-focus-preview-close';
  close.textContent = 'Chiudi anteprima';
  close.style.cssText = 'position:sticky;top:8px;float:right';
  close.onclick = () => root.remove();
  root.appendChild(close);

  const addText = (tag, text, style) => {
    const el = doc.createElement(tag);
    el.textContent = text == null ? '' : String(text);
    if (style) el.style.cssText = style;
    root.appendChild(el);
    return el;
  };

  addText(
    'p',
    'Kentu Focus · anteprima privata · non pubblicata · memoria editoriale vuota · fallback deterministico',
    'letter-spacing:.12em;text-transform:uppercase;font-size:12px;margin:0 0 8px',
  );
  addText('h1', revisionDoc?.headline || 'Edizione', 'font-size:42px;line-height:1.1;margin:0 0 8px');
  addText(
    'p',
    `Edizione del ${meta.publicationDate} · analisi ${meta.analysisDate} · ${meta.proseSource || 'fallback'} · non salvata su Firebase`,
    'margin:0 0 24px;opacity:.75',
  );
  addText('p', revisionDoc?.teaser || '', 'font-size:20px;margin:0 0 32px');

  const articles = [
    revisionDoc?.lead && { role: 'Principale', item: revisionDoc.lead },
    ...(revisionDoc?.goodNews || []).map((a) => ({ role: 'Buona notizia', item: a })),
    ...(revisionDoc?.features || []).map((a) => ({ role: 'Approfondimento', item: a })),
    ...(revisionDoc?.concerns || []).map((a) => ({ role: 'Attenzione', item: a })),
  ].filter(Boolean);

  for (const { role, item } of articles) {
    const section = doc.createElement('section');
    section.style.cssText = 'border-top:1px solid #222;padding:20px 0;max-width:720px';
    const roleEl = doc.createElement('div');
    roleEl.textContent = role;
    roleEl.style.cssText = 'font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.6';
    const title = doc.createElement('h2');
    title.textContent = item.title || '';
    title.style.cssText = 'font-size:26px;margin:6px 0 10px';
    const body = doc.createElement('p');
    body.textContent = item.body || '';
    body.style.cssText = 'margin:0;white-space:pre-wrap';
    section.appendChild(roleEl);
    section.appendChild(title);
    section.appendChild(body);
    root.appendChild(section);
  }

  if (revisionDoc?.coach) {
    const section = doc.createElement('section');
    section.style.cssText = 'border-top:2px solid #222;padding:20px 0;max-width:720px';
    const roleEl = doc.createElement('div');
    roleEl.textContent = 'Coach';
    roleEl.style.cssText = 'font-size:11px;letter-spacing:.08em;text-transform:uppercase';
    const title = doc.createElement('h2');
    title.textContent = revisionDoc.coach.title || '';
    title.style.cssText = 'font-size:22px;margin:6px 0 10px';
    const body = doc.createElement('p');
    body.textContent = revisionDoc.coach.body || '';
    body.style.cssText = 'margin:0;white-space:pre-wrap';
    section.appendChild(roleEl);
    section.appendChild(title);
    section.appendChild(body);
    root.appendChild(section);
  }

  const evidenceLines = [];
  for (const { item } of articles) {
    for (const m of (item.metricsCited || []).slice(0, 4)) {
      const unit = m.unit ? ` ${m.unit}` : '';
      const val = m.value != null ? ` · ${m.value}${unit}` : ' · n/d';
      evidenceLines.push(`${m.path || 'metric'} · ${m.provenance || '?'}${val}`);
    }
  }
  const evSection = doc.createElement('section');
  evSection.style.cssText = 'border-top:1px solid #222;padding:20px 0;max-width:720px';
  const evTitle = doc.createElement('h3');
  evTitle.textContent = 'Evidenze citate';
  evSection.appendChild(evTitle);
  const evList = doc.createElement('ul');
  if (!evidenceLines.length) {
    const li = doc.createElement('li');
    li.textContent = 'Nessuna evidenza numerica in questa anteprima.';
    evList.appendChild(li);
  } else {
    for (const line of evidenceLines) {
      const li = doc.createElement('li');
      li.textContent = line;
      evList.appendChild(li);
    }
  }
  evSection.appendChild(evList);
  root.appendChild(evSection);

  const notes = Array.isArray(meta.missingNotes) && meta.missingNotes.length
    ? meta.missingNotes
    : ['Nessuna segnalazione strutturale oltre alla coverage della finestra.'];
  const missSection = doc.createElement('section');
  missSection.style.cssText = 'border-top:1px solid #222;padding:20px 0;max-width:720px;opacity:.85';
  const missTitle = doc.createElement('h3');
  missTitle.textContent = 'Dati mancanti o incerti';
  missSection.appendChild(missTitle);
  const missList = doc.createElement('ul');
  for (const n of notes) {
    const li = doc.createElement('li');
    li.textContent = n;
    missList.appendChild(li);
  }
  missSection.appendChild(missList);
  root.appendChild(missSection);

  doc.body.appendChild(root);
  return { root, articleCount: articles.length };
}
