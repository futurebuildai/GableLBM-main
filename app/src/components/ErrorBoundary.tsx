import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <div className="text-rose-400 text-lg font-semibold mb-2">
            Something went wrong
          </div>
          <p className="text-gray-400 text-sm mb-4 max-w-md text-center">
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-[#00FFA3] text-[#0A0B10] rounded font-medium hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
