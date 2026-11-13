import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Shared loading / error / empty messages for admin tables. */
export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading...' }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
    <Loader2 className="h-5 w-5 animate-spin" />
    {label}
  </div>
);

export const ErrorState: React.FC<{ error: unknown; onRetry?: () => void }> = ({ error, onRetry }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
    <AlertCircle className="h-8 w-8 text-destructive" />
    <p className="text-sm text-gray-700">Could not load data: {(error as Error)?.message ?? 'Unknown error'}</p>
    {onRetry && (
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
);

export const EmptyState: React.FC<{ title: string; description?: string; action?: React.ReactNode }> = ({
  title,
  description,
  action,
}) => (
  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
    <p className="font-medium text-gray-900">{title}</p>
    {description && <p className="text-sm text-muted-foreground max-w-sm">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);
