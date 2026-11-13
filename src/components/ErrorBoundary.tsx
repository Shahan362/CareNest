import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface State {
  error: Error | null;
}

/**
 * Catches crashes in any page and shows a friendly screen instead of a blank one.
 * A new app version can also make old page files disappear (after a deploy); a reload fixes that.
 */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Visible in the browser console; connect an error service (e.g. Sentry) here for production.
    console.error('CareNest crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const isOldVersion = /Failed to fetch dynamically imported module|Importing a module script failed/i.test(error.message);

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-lg border p-8 max-w-md text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-1">{isOldVersion ? 'CareNest has been updated' : 'Something went wrong'}</h1>
          <p className="text-sm text-gray-600 mb-4">
            {isOldVersion
              ? 'Please reload the page to get the latest version.'
              : 'Sorry, this page hit a problem. Reloading usually fixes it. If it keeps happening, please tell the office.'}
          </p>
          <button
            type="button"
            className="rounded-md bg-primary text-white px-4 py-2 text-sm font-medium"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
