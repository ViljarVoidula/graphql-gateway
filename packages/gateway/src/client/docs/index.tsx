import { createRoot } from 'react-dom/client';
import { DocsApp } from './ui/App';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<DocsApp />);
}
