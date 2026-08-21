import { PHANTOM_REPORT_ROOT_ID } from './PhantomDailyReport.jsx';

/**
 * Genera un PDF (Blob) dal template fantasma `#kentu-phantom-report`.
 * @param {{
 *   title?: string,
 *   filename?: string,
 *   elementId?: string,
 * }} opts
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function generateKentuReportPdfBlob({
  title = 'Bollettino Kentu',
  filename = null,
  elementId = PHANTOM_REPORT_ROOT_ID,
} = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('PDF disponibile solo nel browser');
  }

  const element = document.getElementById(String(elementId || PHANTOM_REPORT_ROOT_ID));
  if (!element) {
    throw new Error(
      `Template PDF non trovato (#${elementId || PHANTOM_REPORT_ROOT_ID}). Assicurati che PhantomDailyReport sia montato.`,
    );
  }

  const html2pdfModule = await import('html2pdf.js');
  const html2pdf = html2pdfModule.default || html2pdfModule;

  const today = new Date().toISOString().split('T')[0];
  const safeFilename = String(filename || `Kentu_Daily_Report_${today}.pdf`)
    .replace(/[<>:"/\\|?*]+/g, '_');

  // html2canvas non disegna nodi con opacity:0 → forza opacità solo durante la cattura.
  const prevOpacity = element.style.opacity;
  const prevVisibility = element.style.visibility;
  element.style.opacity = '1';
  element.style.visibility = 'visible';

  // Attendi paint completo (layout + font) prima di fotografare.
  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, 50);
      });
    });
  });

  const options = {
    margin: 0,
    filename: safeFilename,
    image: { type: 'jpeg', quality: 1 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      scrollY: 0,
      scrollX: 0,
      backgroundColor: '#020617', // slate-950
      logging: false,
    },
    jsPDF: { unit: 'px', format: [800, 1130], orientation: 'portrait' },
  };

  try {
    const blob = await html2pdf().set(options).from(element).outputPdf('blob');
    return { blob, filename: safeFilename, title };
  } finally {
    element.style.opacity = prevOpacity;
    element.style.visibility = prevVisibility;
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
 * Genera e scarica il PDF del Daily Report (template phantom).
 */
export async function downloadKentuReportPdf(opts = {}) {
  const { blob, filename } = await generateKentuReportPdfBlob(opts);
  triggerBlobDownload(blob, filename);
  return { blob, filename, downloaded: true };
}

/**
 * Condivide il PDF via Web Share API; fallback download se non supportata / fallisce.
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
