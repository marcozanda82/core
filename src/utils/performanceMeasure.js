/**
 * performanceMeasure.js
 * 
 * Utility per misurare le performance dei calcoli pesanti.
 * 
 * IMPORTANTE: Questo file è temporaneo per il profiling.
 */

// Contatore per tracciare le esecuzioni multiple
const executionCounts = new Map();
const executionTimes = new Map();

/**
 * Wrapper per misurare un calcolo
 * @param {string} name - Nome del calcolo
 * @param {Function} fn - Funzione da eseguire
 * @returns {any} - Risultato della funzione
 */
export function measureComputation(name, fn) {
  const startMark = `${name}-start-${Date.now()}`;
  const endMark = `${name}-end-${Date.now()}`;
  
  performance.mark(startMark);
  const startTime = performance.now();
  
  try {
    const result = fn();
    
    performance.mark(endMark);
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Traccia esecuzioni
    const count = (executionCounts.get(name) || 0) + 1;
    executionCounts.set(name, count);
    
    // Memorizza tutti i tempi
    if (!executionTimes.has(name)) {
      executionTimes.set(name, []);
    }
    executionTimes.get(name).push(duration);
    
    // Log dettagliato
    const times = executionTimes.get(name);
    const max = Math.max(...times);
    const total = times.reduce((a, b) => a + b, 0);
    
    console.log(
      `[PERF] ${name}: ${Math.round(duration)}ms ` +
      `(execution #${count}, max: ${Math.round(max)}ms, total: ${Math.round(total)}ms)`
    );
    
    // Se è la prima esecuzione, segna anche il timing rispetto all'app start
    if (count === 1) {
      try {
        performance.measure(`app-to-${name}`, 'app-start', endMark);
        const measure = performance.getEntriesByName(`app-to-${name}`)[0];
        console.log(`[PERF] APP → ${name} (first): ${Math.round(measure.duration)}ms`);
      } catch (e) {
        // app-start might not be defined
      }
    }
    
    return result;
  } catch (error) {
    console.error(`[PERF] ${name} threw error:`, error);
    throw error;
  }
}

/**
 * Ottiene le statistiche di tutte le misurazioni
 */
export function getPerformanceStats() {
  const stats = {};
  
  for (const [name, times] of executionTimes.entries()) {
    const count = times.length;
    const total = times.reduce((a, b) => a + b, 0);
    const max = Math.max(...times);
    const first = times[0];
    const reexecutions = count - 1;
    
    stats[name] = {
      count,
      first,
      max,
      total,
      reexecutions,
      avg: total / count,
    };
  }
  
  return stats;
}

/**
 * Resetta tutte le statistiche
 */
export function resetPerformanceStats() {
  executionCounts.clear();
  executionTimes.clear();
}

/**
 * Stampa un report delle performance
 */
export function printPerformanceReport() {
  console.log('\n========================================');
  console.log('PERFORMANCE REPORT - Heavy Computations');
  console.log('========================================\n');
  
  const stats = getPerformanceStats();
  const entries = Object.entries(stats).sort((a, b) => b[1].total - a[1].total);
  
  if (entries.length === 0) {
    console.log('No computations measured yet.');
    return;
  }
  
  console.table(
    entries.reduce((acc, [name, data]) => {
      acc[name] = {
        'First (ms)': Math.round(data.first),
        'Re-exec': data.reexecutions,
        'Max (ms)': Math.round(data.max),
        'Total (ms)': Math.round(data.total),
        'Avg (ms)': Math.round(data.avg),
      };
      return acc;
    }, {})
  );
  
  console.log('\n========================================\n');
}
