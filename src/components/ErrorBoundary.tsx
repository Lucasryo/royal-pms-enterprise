import { Component, ErrorInfo, PropsWithChildren } from 'react';

interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends Component<PropsWithChildren<object>, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="text-sm font-black uppercase tracking-widest text-red-600">Erro inesperado</p>
            <p className="mt-2 text-sm text-neutral-600">{this.state.message || 'Ocorreu um erro ao renderizar esta página.'}</p>
            <button
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="mt-4 rounded-xl bg-neutral-950 px-4 py-2 text-sm font-bold text-white"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
