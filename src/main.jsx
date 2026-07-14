import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import { AuthProvider } from '@/hooks/useAuth';
import { LanguageProvider } from '@/contexts/LanguageContext';
import ErrorBoundary from '@/components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
        <LanguageProvider>
            <AuthProvider>
                <App />
            </AuthProvider>
        </LanguageProvider>
    </ErrorBoundary>
);