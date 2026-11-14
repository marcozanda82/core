import { Suspense, lazy } from 'react';

const Markdown = lazy(() => import('react-markdown'));

/** react-markdown entra solo quando un testo va davvero in pagina. */
export default function LazyMarkdown({ children, components }) {
  return (
    <Suspense fallback={null}>
      <Markdown components={components}>{children}</Markdown>
    </Suspense>
  );
}
