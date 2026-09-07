import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense, lazy, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, createCareQueryClient } from '@care/frontend-core';
import { Loader } from '@care/ui';
import { App } from './App.js';

const DesignPage = lazy(() => import('./design/DesignPage.js'));

function BootReady() {
  useEffect(() => window.__CARE_BOOT__?.markMounted(), []);
  return null;
}

export function mountCareApp(isDesignRoute: boolean) {
  const queryClient = createCareQueryClient();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BootReady />
      {isDesignRoute ? (
        <Suspense
          fallback={
            <main className="route-loader">
              <Loader label="Memuat design system" />
            </main>
          }
        >
          <DesignPage />
        </Suspense>
      ) : (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      )}
    </StrictMode>,
  );
}
