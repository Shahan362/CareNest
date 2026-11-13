import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { CareNoteRow } from '@/lib/database.types';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface CareNotesListProps {
  notes: CareNoteRow[];
  /** Optional label per note, e.g. the patient's name on the admin dashboard. */
  subtitle?: (note: CareNoteRow) => React.ReactNode;
  emptyText?: string;
}

/** Read-only list of care notes, newest first. Used on caregiver and admin screens. */
const CareNotesList: React.FC<CareNotesListProps> = ({ notes, subtitle, emptyText = 'No care notes yet.' }) => {
  if (notes.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <ul className="space-y-3">
      {notes.map((n) => (
        <li
          key={n.id}
          className={cn('rounded-lg border p-3 text-sm', n.is_concern && !n.resolved_at ? 'border-amber-300 bg-amber-50' : 'bg-gray-50')}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-1">
            <span className="font-medium text-gray-900">{n.author_name}</span>
            <span className="text-xs text-gray-500">{formatDateTime(n.created_at)}</span>
          </div>
          {subtitle && <div className="text-xs text-gray-600 mb-1">{subtitle(n)}</div>}
          <p className="whitespace-pre-wrap text-gray-800">{n.body}</p>
          {n.is_concern && (
            <p className={cn('mt-2 flex items-center gap-1 text-xs font-medium', n.resolved_at ? 'text-green-700' : 'text-amber-800')}>
              {n.resolved_at ? (
                <><CheckCircle2 className="h-3.5 w-3.5" /> Concern resolved by the office {formatDateTime(n.resolved_at)}</>
              ) : (
                <><AlertTriangle className="h-3.5 w-3.5" /> Concern raised with the office</>
              )}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
};

export default CareNotesList;
