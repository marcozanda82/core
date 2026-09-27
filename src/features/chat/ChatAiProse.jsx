import ReactMarkdown from 'react-markdown';

const PROSE_P = 'mb-2 mt-0 last:mb-0 text-base font-normal leading-relaxed text-slate-200';
const PROSE_H = 'mb-2 mt-0 text-base font-semibold leading-snug text-slate-50';

const markdownComponents = {
  p: ({ children }) => <p className={PROSE_P}>{children}</p>,
  h1: ({ children }) => <h3 className={PROSE_H}>{children}</h3>,
  h2: ({ children }) => <h3 className={PROSE_H}>{children}</h3>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-0 text-base font-semibold leading-snug text-slate-100">{children}</h3>,
  strong: ({ children }) => <strong className="font-semibold text-slate-50">{children}</strong>,
  em: ({ children }) => <em className="italic text-slate-200">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2 mt-1 list-disc space-y-1 pl-4 text-base font-normal leading-relaxed text-slate-200">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 mt-1 list-decimal space-y-1 pl-4 text-base font-normal leading-relaxed text-slate-200">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="text-base font-normal leading-relaxed">{children}</li>,
  a: ({ children }) => <span>{children}</span>,
  img: () => null,
  code: ({ children }) => (
    <code className="rounded bg-white/10 px-1 py-0.5 text-sm font-normal text-cyan-100">{children}</code>
  ),
};

/**
 * Corpo messaggio AI: paragrafi a text-base, grassetto solo su strong/h3.
 */
export default function ChatAiProse({ text, className = '' }) {
  const source = String(text || '').trim();
  if (!source) return null;
  return (
    <div className={['kentu-ai-prose max-w-full', className].filter(Boolean).join(' ')}>
      <ReactMarkdown components={markdownComponents}>{source}</ReactMarkdown>
    </div>
  );
}
