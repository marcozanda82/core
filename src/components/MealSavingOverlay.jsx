import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Asset statici in /public (Vite li serve dalla root).
 * BASE_URL copre anche deploy con base path diverso da "/".
 */
const PUBLIC_BASE = String(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const CHEF_SAVE_VIDEO_SRC = `${PUBLIC_BASE}Chef2animazione.mp4`;
const CHEF_SAVE_POSTER_SRC = `${PUBLIC_BASE}Chef2.png`;

/**
 * Overlay full-screen durante il salvataggio pasto (video chef in loop).
 * Blocca interazioni sullo sfondo per evitare doppi invii.
 * Renderizzato in portal su body così sopravvive allo smontaggio del logger/tray.
 * Skip / onEnded chiudono solo questa UI: il write Firebase resta in background.
 */
export default function MealSavingOverlay({
  open = false,
  message = 'Salvataggio in corso, attendere...',
  onClose = null,
  onVideoEnd = null,
}) {
  const videoRef = useRef(null);
  const closeUiRef = useRef(onVideoEnd || onClose);
  closeUiRef.current = onVideoEnd || onClose;

  const handleVideoEnd = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
      } catch (_) {
        /* ignore */
      }
    }
    if (typeof closeUiRef.current === 'function') {
      closeUiRef.current();
    }
  }, []);

  // Forzatura totale: ad ogni apertura/montaggio del player.
  useEffect(() => {
    if (!open) return undefined;

    const video = videoRef.current;
    if (!video) return undefined;

    video.muted = true; // Necessario per l'autoplay in molte WebView
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    try {
      video.currentTime = 0;
    } catch (_) {
      /* ignore seek errors before metadata */
    }

    const tryPlay = () => {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          console.warn('Video playback blocked, retrying...', err);
          // Ritenta dopo un breve delay se bloccato
          window.setTimeout(() => {
            video.play().catch(() => {});
          }, 100);
        });
      }
    };

    tryPlay();

    const onCanPlay = () => tryPlay();
    const onLoadedData = () => tryPlay();
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('loadeddata', onLoadedData);

    // Secondo tentativo dopo paint (WebView / overlay portal).
    const retryTimer = window.setTimeout(() => tryPlay(), 250);

    return () => {
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('loadeddata', onLoadedData);
      window.clearTimeout(retryTimer);
      try {
        video.pause();
      } catch (_) {
        /* ignore */
      }
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100200] flex items-center justify-center bg-black/90 px-4 sm:px-6"
      role="alertdialog"
      aria-busy="true"
      aria-live="polite"
      aria-label={message}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="relative aspect-square w-full max-w-sm sm:h-96 sm:w-96 sm:max-w-none">
          <div className="absolute inset-0 overflow-hidden rounded-2xl border border-emerald-500/40 bg-[#0b1220] shadow-2xl">
            <img
              src={CHEF_SAVE_POSTER_SRC}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
            <video
              ref={videoRef}
              className="relative z-[1] h-full w-full rounded-2xl object-cover [transform:translateZ(0)] transform-gpu will-change-transform"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              poster={CHEF_SAVE_POSTER_SRC}
              controls={false}
              disablePictureInPicture
              onEnded={handleVideoEnd}
              onLoadedMetadata={() => console.log('Video metadata loaded')}
              onCanPlay={() => console.log('Video can play')}
              onPlaying={() => console.log('Video playing')}
              onError={(e) => console.error('Video error:', e.target?.error)}
            >
              <source src={CHEF_SAVE_VIDEO_SRC} type="video/mp4" />
              Il tuo browser non supporta il video.
            </video>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleVideoEnd();
            }}
            aria-label="Salta video"
            title="Salta"
            className="absolute right-2 top-2 z-30 inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-white/25 bg-black/70 px-3 text-white shadow-lg shadow-black/40 backdrop-blur-md transition active:scale-95 hover:bg-black/85"
          >
            <X className="h-5 w-5" strokeWidth={2.4} aria-hidden />
            <span className="pr-0.5 text-xs font-semibold tracking-wide">Salta</span>
          </button>
        </div>
        <p className="mt-6 text-base font-semibold tracking-wide text-cyan-50 animate-pulse sm:text-lg">
          {message}
        </p>
        <div
          className="mx-auto mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-white/10"
          aria-hidden
        >
          <div className="h-full w-1/2 animate-[kentu-chef-bar_1.2s_ease-in-out_infinite] rounded-full bg-emerald-400/80" />
        </div>
      </div>
      <style>
        {`@keyframes kentu-chef-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }`}
      </style>
    </div>,
    document.body,
  );
}

/** Durata minima overlay per fluidità visiva (ms). */
export const MEAL_SAVE_OVERLAY_MIN_MS = 1500;

/**
 * Esegue il salvataggio rispettando una durata minima (overlay chef).
 * @param {() => (void|Promise<unknown>)} saveFn
 * @param {number} [minMs]
 */
export async function runMealSaveWithMinDuration(saveFn, minMs = MEAL_SAVE_OVERLAY_MIN_MS) {
  const started = Date.now();
  const result = await Promise.resolve(typeof saveFn === 'function' ? saveFn() : undefined);
  const elapsed = Date.now() - started;
  if (elapsed < minMs) {
    await new Promise((resolve) => {
      window.setTimeout(resolve, minMs - elapsed);
    });
  }
  return result;
}
