import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, createCareQueryClient } from '@care/frontend-core';
import { DesktopOnlyGate } from '@care/ui';
import { App } from './App.js';
import './styles.css';

const queryClient = createCareQueryClient();

function Root() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1280px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const update = () => setDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return (
    <DesktopOnlyGate matches={desktop}>
      {desktop ? (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      ) : null}
    </DesktopOnlyGate>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
