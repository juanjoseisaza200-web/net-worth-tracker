import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Isolates chart rendering failures. Charting libraries (recharts) can throw
 * during render in some environments; without a boundary a single throw
 * unmounts the whole app (blank screen). This catches it and shows a small
 * fallback so the rest of the screen keeps working.
 */
export default class ChartErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Chart failed to render:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="text-center text-gray-400 text-sm py-8">
            Chart unavailable.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
