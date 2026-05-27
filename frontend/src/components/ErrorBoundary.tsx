import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface p-4">
          <div className="bg-surface-container-lowest rounded-xl border border-error/30 p-8 max-w-lg w-full text-center shadow-lg">
            <span className="material-symbols-outlined text-error text-[64px] mb-4">
              error
            </span>
            <h1 className="text-h2 font-h2 text-on-surface mb-2">
              Kechirasiz, xatolik yuz berdi
            </h1>
            <p className="text-body-md font-body-md text-on-surface-variant mb-6">
              Ilovada kutilmagan xatolik yuz berdi. Iltimos, sahifani yangilang yoki birozdan so'ng qayta urinib ko'ring.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-label-md hover:opacity-90 transition-opacity"
              >
                Sahifani yangilash
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-6 py-2.5 bg-surface-container text-on-surface rounded-xl border border-outline-variant font-label-md hover:bg-surface-container-high transition-colors"
              >
                Bosh sahifa
              </button>
            </div>
            {import.meta.env.DEV && this.state.error && (
              <div className="mt-6 text-left bg-surface-container-high p-4 rounded-lg overflow-auto max-h-40">
                <p className="text-error font-mono text-xs whitespace-pre-wrap">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
