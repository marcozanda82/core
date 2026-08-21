/**
 * Markdown → HTML minimale per export PDF (niente Tailwind / glass).
 * @param {string} markdown
 * @returns {string}
 */
export function markdownToPlainHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  const inline = (text) => String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  for (const raw of lines) {
    const line = String(raw || '');
    const trimmed = line.trim();

    if (!trimmed) {
      closeLists();
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      closeLists();
      html.push('<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />');
      continue;
    }

    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1) {
      closeLists();
      html.push(`<h1 style="font-size:20px;font-weight:700;margin:0 0 12px;color:#111827;">${inline(h1[1])}</h1>`);
      continue;
    }
    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      closeLists();
      html.push(`<h2 style="font-size:17px;font-weight:700;margin:16px 0 8px;color:#111827;">${inline(h2[1])}</h2>`);
      continue;
    }
    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) {
      closeLists();
      html.push(`<h3 style="font-size:15px;font-weight:600;margin:14px 0 6px;color:#0f766e;">${inline(h3[1])}</h3>`);
      continue;
    }

    const ul = trimmed.match(/^[-*]\s+(.+)$/);
    if (ul) {
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul style="margin:0 0 12px;padding-left:20px;color:#111827;">');
        inUl = true;
      }
      html.push(`<li style="margin:0 0 4px;line-height:1.45;">${inline(ul[1])}</li>`);
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol style="margin:0 0 12px;padding-left:20px;color:#111827;">');
        inOl = true;
      }
      html.push(`<li style="margin:0 0 4px;line-height:1.45;">${inline(ol[1])}</li>`);
      continue;
    }

    closeLists();
    html.push(`<p style="margin:0 0 10px;line-height:1.5;color:#111827;font-size:13px;">${inline(trimmed)}</p>`);
  }

  closeLists();
  return html.join('');
}

/**
 * Genera un PDF (Blob) da HTML chiaro (container off-screen).
 * @param {{
 *   title?: string,
 *   markdown?: string,
 *   coverSrc?: string,
 *   filename?: string,
 * }} opts
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function generateKentuReportPdfBlob({
  title = 'Bollettino Kentu',
  markdown = '',
  coverSrc = '/report.jpg',
  filename = null,
} = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('PDF disponibile solo nel browser');
  }

  const bodyMd = String(markdown || '').trim();
  if (!bodyMd) {
    throw new Error('Nessun contenuto da esportare');
  }

  const html2pdfModule = await import('html2pdf.js');
  const html2pdf = html2pdfModule.default || html2pdfModule;

  const today = new Date().toISOString().slice(0, 10);
  const safeFilename = String(filename || `KentuOS_Bollettino_${today}.pdf`)
    .replace(/[<>:"/\\|?*]+/g, '_');

  const absCover = (() => {
    const src = String(coverSrc || '').trim();
    if (!src) return '';
    if (/^https?:\/\//i.test(src)) return src;
    try {
      return new URL(src, window.location.origin).href;
    } catch {
      return src;
    }
  })();

  const host = document.createElement('div');
  host.setAttribute('id', `kentu-pdf-host-${Date.now()}`);
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = [
    'position:absolute',
    'left:-9999px',
    'top:0',
    'width:794px',
    'background:#ffffff',
    'color:#111827',
    'font-family:Arial,Helvetica,sans-serif',
    'z-index:-1',
    'pointer-events:none',
  ].join(';');

  const inner = document.createElement('div');
  inner.setAttribute('id', 'pdf-report-content-id');
  inner.style.cssText = [
    'box-sizing:border-box',
    'width:100%',
    'padding:24px',
    'background:#ffffff',
    'color:#111827',
    'font-family:Arial,Helvetica,sans-serif',
    'font-size:13px',
    'line-height:1.5',
  ].join(';');

  const coverHtml = absCover
    ? `<img src="${absCover}" alt="" crossorigin="anonymous" style="display:block;width:100%;height:160px;object-fit:cover;border-radius:8px;margin:0 0 16px;background:#e5e7eb;" />`
    : '';

  const heading = String(title || 'Bollettino Kentu')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  inner.innerHTML = [
    coverHtml,
    `<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;margin:0 0 4px;">KentuOS</div>`,
    `<div style="font-size:18px;font-weight:700;color:#111827;margin:0 0 16px;">${heading}</div>`,
    markdownToPlainHtml(bodyMd),
  ].join('');

  host.appendChild(inner);
  document.body.appendChild(host);

  // Attendi layout + eventuale load immagine copertina
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  const coverImg = inner.querySelector('img');
  if (coverImg && !coverImg.complete) {
    await Promise.race([
      new Promise((resolve) => {
        coverImg.onload = () => resolve();
        coverImg.onerror = () => resolve();
      }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  }

  const options = {
    margin: 10,
    filename: safeFilename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  };

  try {
    const blob = await html2pdf().set(options).from(inner).outputPdf('blob');
    return { blob, filename: safeFilename };
  } finally {
    host.remove();
  }
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Genera e scarica un PDF da HTML chiaro (container off-screen).
 * @param {{
 *   title?: string,
 *   markdown?: string,
 *   coverSrc?: string,
 *   filename?: string,
 * }} opts
 */
export async function downloadKentuReportPdf(opts = {}) {
  const { blob, filename } = await generateKentuReportPdfBlob(opts);
  triggerBlobDownload(blob, filename);
  return { blob, filename, downloaded: true };
}

/**
 * Condivide il PDF via Web Share API; fallback download se non supportata / fallisce.
 * @param {{
 *   title?: string,
 *   markdown?: string,
 *   coverSrc?: string,
 *   filename?: string,
 * }} opts
 * @returns {Promise<{ shared?: boolean, downloaded?: boolean, aborted?: boolean }>}
 */
export async function shareOrDownloadKentuReportPdf(opts = {}) {
  const { blob, filename } = await generateKentuReportPdfBlob(opts);
  const title = String(opts.title || 'Bollettino Kentu').trim() || 'Bollettino Kentu';
  const file = new File([blob], filename, { type: 'application/pdf' });

  const canShareFiles = typeof navigator !== 'undefined'
    && typeof navigator.share === 'function'
    && (
      typeof navigator.canShare !== 'function'
      || navigator.canShare({ files: [file] })
    );

  if (canShareFiles) {
    try {
      await navigator.share({
        title,
        text: `${title} — KentuOS`,
        files: [file],
      });
      return { shared: true };
    } catch (error) {
      if (error && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
        return { shared: false, aborted: true };
      }
      console.warn('[shareOrDownloadKentuReportPdf] share failed, falling back to download', error);
    }
  }

  triggerBlobDownload(blob, filename);
  return { shared: false, downloaded: true };
}
