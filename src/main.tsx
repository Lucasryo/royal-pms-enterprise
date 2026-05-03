import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import React from 'react';
import App from './App.tsx';
import './index.css';

interface EBState { hasError: boolean; message: string; stack: string }
class RootErrorBoundary extends React.Component<React.PropsWithChildren, EBState> {
  state: EBState = { hasError: false, message: '', stack: '' };
  static getDerivedStateFromError(e: Error): EBState {
    return { hasError: true, message: e.message, stack: e.stack || '' };
  }
  componentDidCatch(e: Error, info: React.ErrorInfo) {
    console.error('[RootErrorBoundary]', e, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#F8F9FA', fontFamily: 'sans-serif' }}>
          <div style={{ maxWidth: 640, width: '100%', background: '#fff', border: '1px solid #fca5a5', borderRadius: 16, padding: 24 }}>
            <p style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, color: '#dc2626', fontSize: 12 }}>Erro crítico no Royal PMS</p>
            <p style={{ marginTop: 12, fontSize: 14, color: '#111', fontWeight: 600 }}>{this.state.message || 'Erro ao inicializar.'}</p>
            <pre style={{ marginTop: 12, padding: 12, background: '#fef2f2', borderRadius: 8, fontSize: 11, color: '#7f1d1d', overflow: 'auto', maxHeight: 240, whiteSpace: 'pre-wrap' }}>{this.state.stack}</pre>
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
