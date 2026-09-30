import { lazy } from 'react';

export const lazyWithRetry = (componentImport) =>
  lazy(async () => {
    const pageRefreshed = JSON.parse(
      window.sessionStorage.getItem('page-reloaded-for-chunk-error') || 'false'
    );

    try {
      const component = await componentImport();
      window.sessionStorage.setItem('page-reloaded-for-chunk-error', 'false');
      return component;
    } catch (error) {
      if (!pageRefreshed) {
        // Salva il flag per evitare loop infiniti se la rete è assente
        window.sessionStorage.setItem('page-reloaded-for-chunk-error', 'true');
        window.location.reload();
        return new Promise(() => {}); // Sospende il rendering mentre ricarica
      }
      throw error;
    }
  });
