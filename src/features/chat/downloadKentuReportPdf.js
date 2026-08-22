import { PHANTOM_REPORT_ROOT_ID } from './PhantomDailyReport.jsx';

const PDF_CAPTURE_YIELD_MS = 300;

function buildPdfOptions(filename) {
  return {
    margin: 0,
    filename,
    image: { type: 'jpeg', quality: 1 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: '#020617', // slate-950
      logging: false,
      scrollX: 0,
      scrollY: 0,
    },
    jsPDF: { unit: 'px', format: [800, 1130], orientation: 'portrait' },
  };
}

/**
 * Attende un frame di paint React + breve yield per font/grafici.
 * Non smontare il phantom finché questa Promise (e la cattura) non sono complete.
 */
async function waitForPhantomPaint() {
  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, PDF_CAPTURE_YIELD_MS);
      });
    });
  });
}

async function resolveHtml2Pdf() {
  const html2pdfModule = await import('html2pdf.js');
  return html2pdfModule.default || html2pdfModule;
}

function resolvePhantomElement(elementId) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('PDF disponibile solo nel browser');
  }
  const id = String(elementId || PHANTOM_REPORT_ROOT_ID);
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(
      `Template PDF non trovato (#${id}). Assicurati che PhantomDailyReport sia montato.`,
    );
  }
  return element;
}

function resolveFilename(filename) {
  const today = new Date().toISOString().split('T')[0];
  return String(filename || `Kentu_Daily_Report_${today}.pdf`)
    .replace(/[<>:"/\\|?*]+/g, '_');
}

/**
 * Genera un PDF (Blob) dal template fantasma `#kentu-phantom-report`.
 * Attende il paint e la risoluzione di html2pdf prima di ritornare.
 *
 * @param {{
 *   title?: string,
 *   filename?: string,
 *   elementId?: string,
 * }} opts
 * @returns {Promise<{ blob: Blob, filename: string, title: string }>}
 */
export async function generateKentuReportPdfBlob({
  title = 'Bollettino Kentu',
  filename = null,
  elementId = PHANTOM_REPORT_ROOT_ID,
} = {}) {
  const element = resolvePhantomElement(elementId);
  const safeFilename = resolveFilename(filename);
  const html2pdf = await resolveHtml2Pdf();

  // Yield: React deve aver layoutato grafici/font nel nodo off-screen (no opacity:0).
  await waitForPhantomPaint();

  const options = buildPdfOptions(safeFilename);

  try {
    const blob = await html2pdf().set(options).from(element).outputPdf('blob');
    return { blob, filename: safeFilename, title };
  } catch (error) {
    console.error('Errore generazione PDF:', error);
    throw error;
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
 * Genera e scarica il PDF — attende `.save()` prima di risolvere.
 * Lo stato UI (loader) va resettato solo dopo questa Promise (finally nel caller).
 */
export async function downloadKentuReportPdf(opts = {}) {
  const element = resolvePhantomElement(opts.elementId);
  const safeFilename = resolveFilename(opts.filename);
  const html2pdf = await resolveHtml2Pdf();

  await waitForPhantomPaint();

  const options = buildPdfOptions(safeFilename);

  try {
    await html2pdf().from(element).set(options).save();
    return { filename: safeFilename, downloaded: true };
  } catch (error) {
    console.error('Errore generazione PDF:', error);
    throw error;
  }
}

/**
 * Condivide il PDF via Web Share API; fallback download se non supportata / fallisce.
 * Completa solo dopo blob + share/download (niente reset stato prematuro).
 */
export async function shareOrDownloadKentuReportPdf(opts = {}) {
  const { blob, filename } = await generateKentuReportPdfBlob(opts);
  const title = String(opts.title || 'Kentu Daily Report').trim() || 'Kentu Daily Report';
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
