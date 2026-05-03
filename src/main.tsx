import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import React from 'react';
import App from './App.tsx';
import './index.css';

interface EBState { hasError: boolean; message: string }
class RootErrorBoundary extends React.Component<React.PropsWithChildren, EBState> {
  state: EBState = { hasError: false, message: '' };
  static getDerivedStateFromError(e: Error): EBState { return { hasError: true, message: e.message }; }
  componentDidCatch(e: Error, info: React.ErrorInfo) { console.error('[RootErrorBoundary]', e, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: '#F8F9FA', fontFamily: 'sans-serif' }}>
          <div style={{ maxWidth: 480, background: '#fff', border: '1px solid #fca5a5', borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <p style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, color: '#dc2626', fontSize: 12 }}>Erro crítico</p>
            <p style={{ marginTop: 8, fontSize: 14, color: '#374151' }}>{this.state.message || 'Erro ao inicializar o Royal PMS.'}</p>
            <button onClick={() => window.location.reload()} style={{ marginTop: 16, background: '#111', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 24px', fontWeight: 700, cursor: 'pointer' }}>
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);
