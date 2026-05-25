import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Mirror the system colour scheme onto <html> so the @inkprint/ui theme's
// `.dark` variant picks up automatically. (The web app has a full Light/Dark/
// Auto toggle; the popup just follows the OS for now.)
const applyTheme = (): void => {
  const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', isDark);
};
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

const container = document.getElementById('root');
if (container) createRoot(container).render(<App />);
