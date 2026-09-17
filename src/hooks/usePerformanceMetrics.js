/**
 * usePerformanceMetrics.js
 * 
 * Hook per estrarre e loggare le metriche di performance del browser:
 * - First Paint (FP)
 * - First Contentful Paint (FCP)
 * - Largest Contentful Paint (LCP)
 * - DOMContentLoaded
 * - Load Event
 * 
 * IMPORTANTE: Questo hook è temporaneo per il profiling.
 */

import { useEffect } from 'react';

export function usePerformanceMetrics() {
  useEffect(() => {
    // ============================================================
    // PERFORMANCE PROFILING: Browser Paint Metrics
    // ============================================================
    
    const logMetrics = () => {
      try {
        // Navigation Timing API
        const navTiming = performance.getEntriesByType('navigation')[0];
        if (navTiming) {
          const domContentLoaded = navTiming.domContentLoadedEventEnd - navTiming.fetchStart;
          const loadEvent = navTiming.loadEventEnd - navTiming.fetchStart;
          
          console.log(`[PERF] DOMContentLoaded: ${Math.round(domContentLoaded)}ms`);
          console.log(`[PERF] Load Event: ${Math.round(loadEvent)}ms`);
          
          performance.mark('dom-content-loaded');
          performance.mark('load-event');
        }
        
        // Paint Timing API
        const paintEntries = performance.getEntriesByType('paint');
        paintEntries.forEach((entry) => {
          if (entry.name === 'first-paint') {
            console.log(`[PERF] First Paint (FP): ${Math.round(entry.startTime)}ms`);
            performance.mark('first-paint');
          } else if (entry.name === 'first-contentful-paint') {
            console.log(`[PERF] First Contentful Paint (FCP): ${Math.round(entry.startTime)}ms`);
            performance.mark('first-contentful-paint');
            
            try {
              performance.measure('app-to-fcp', 'app-start', 'first-contentful-paint');
              const fcpMeasure = performance.getEntriesByName('app-to-fcp')[0];
              console.log(`[PERF] APP → FCP: ${Math.round(fcpMeasure.duration)}ms`);
            } catch (e) {
              // app-start might not be defined yet
            }
          }
        });
        
        // Largest Contentful Paint (LCP)
        // LCP può essere aggiornato più volte, quindi usiamo PerformanceObserver
        if ('PerformanceObserver' in window) {
          try {
            const lcpObserver = new PerformanceObserver((list) => {
              const entries = list.getEntries();
              const lastEntry = entries[entries.length - 1];
              
              console.log(`[PERF] Largest Contentful Paint (LCP): ${Math.round(lastEntry.startTime)}ms`);
              performance.mark('largest-contentful-paint');
              
              try {
                performance.measure('app-to-lcp', 'app-start', 'largest-contentful-paint');
                const lcpMeasure = performance.getEntriesByName('app-to-lcp')[0];
                console.log(`[PERF] APP → LCP: ${Math.round(lcpMeasure.duration)}ms`);
              } catch (e) {
                // app-start might not be defined yet
              }
            });
            
            lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
            
            // Cleanup observer after 10 seconds (LCP should stabilize by then)
            setTimeout(() => {
              lcpObserver.disconnect();
            }, 10000);
          } catch (e) {
            console.warn('[PERF] Could not observe LCP', e);
          }
        }
      } catch (e) {
        console.warn('[PERF] Could not extract browser metrics', e);
      }
    };
    
    // Run after mount and after load event
    if (document.readyState === 'complete') {
      logMetrics();
    } else {
      window.addEventListener('load', logMetrics);
      return () => window.removeEventListener('load', logMetrics);
    }
  }, []);
}
