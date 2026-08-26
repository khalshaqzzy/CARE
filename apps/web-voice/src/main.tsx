import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, createCareQueryClient } from '@care/frontend-core';
import { Loader } from '@care/ui';
import { App } from './App.js';
import './styles.css';

const DesignPage = lazy(() => import('./design/DesignPage.js'));
const queryClient = createCareQueryClient();
const isDesignRoute =
  window.location.pathname === '/design' || window.location.pathname.startsWith('/design/');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
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
