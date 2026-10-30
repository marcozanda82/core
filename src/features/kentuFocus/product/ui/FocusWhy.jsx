import React from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';

/**
 * Accordion "Perché te lo dico".
 * @param {{ children: React.ReactNode, defaultOpen?: boolean }} props
 */
export function FocusWhy({ children, defaultOpen = false }) {
  return (
    <details className="kf-v-why" data-testid="kf-report-why" open={defaultOpen || undefined}>
      <summary className="kf-v-why-summary">
        <span className="kf-v-why-chip" aria-hidden="true">
          <BookOpen size={18} strokeWidth={2.2} />
        </span>
        <span className="kf-v-why-copy">
          <span className="kf-v-why-title">Perché te lo dico</span>
          <span className="kf-v-why-sub">Da dove vengono i numeri e cosa osservare</span>
        </span>
        <ChevronDown className="kf-v-why-chevron" size={20} aria-hidden="true" />
      </summary>
      <div className="kf-v-why-body">
        {children}
      </div>
    </details>
  );
}

export default FocusWhy;
