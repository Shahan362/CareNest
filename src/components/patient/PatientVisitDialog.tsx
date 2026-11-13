import React from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Circle, Clock, NotebookPen, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCareNotes } from '@/hooks/data/useCaregiverData';
import type { PatientVisit } from '@/hooks/data/usePatientData';
import { formatDateTime, formatTime } from '@/lib/format';
import { STATUS_LABEL, STATUS_STYLE, durationLabel, durationMinutes } from '@/lib/visits';
import { cn } from '@/lib/utils';

interface PatientVisitDialogProps {
  visit: PatientVisit | null;
  onOpenChange: (open: boolean) => void;
  onRequestChange?: (visit: PatientVisit) => void;
}

/** What a patient (or family) sees about one visit: time, carer, tasks done and the carer's note. */
const PatientVisitDialog: React.FC<PatientVisitDialogProps> = ({ visit, onOpenChange, onRequestChange }) => {
  const notes = useCareNotes({ visitId: visit?.row.id });
  if (!visit) return null;
  const { row } = visit;
  const upcoming = row.status === 'scheduled' && visit.start > new Date();

  return (
    <Dialog open={!!visit} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span>{format(visit.start, 'EEEE d MMMM')}</span>
            <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border', STATUS_STYLE[row.status])}>
              {STATUS_LABEL[row.status]}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            {formatTime(visit.start)}-{formatTime(visit.end)} ({durationLabel(durationMinutes(row))})
          </p>
          <p className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            Carer: {visit.carer}
          </p>
          {row.checked_in_at && (
            <p className="text-gray-700">
              Arrived {formatTime(row.checked_in_at)}
              {row.checked_out_at && <>, left {formatTime(row.checked_out_at)}</>}
            </p>
          )}

          {row.tasks.length > 0 && (
            <div>
              <p className="font-medium mb-1">{row.status === 'completed' ? 'Care given' : 'Planned care'}</p>
              <ul className="space-y-1">
                {row.tasks.map((t) => {
                  const done = row.tasks_done.includes(t);
                  return (
                    <li key={t} className="flex items-center gap-2">
                      {row.status === 'completed' ? (
                        done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Circle className="h-4 w-4 text-gray-300" />
                      )}
                      <span className={cn(row.status === 'completed' && !done && 'text-gray-500')}>
                        {t}
                        {row.status === 'completed' && !done && ' (not done, see note)'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {(notes.data?.length ?? 0) > 0 && (
            <div>
              <p className="font-medium mb-1 flex items-center gap-2"><NotebookPen className="h-4 w-4 text-primary" />Carer's notes</p>
              <ul className="space-y-2">
                {notes.data!.map((n) => (
                  <li key={n.id} className="rounded-lg bg-gray-50 border p-3">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="text-xs text-gray-500 mt-1">{n.author_name} · {formatDateTime(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {row.status === 'cancelled' && <p className="text-gray-600">This visit was cancelled.</p>}
          {row.status === 'missed' && <p className="text-gray-600">The carer could not carry out this visit. The office has been told.</p>}

          {upcoming && onRequestChange && (
            <Button variant="outline" className="w-full" onClick={() => onRequestChange(visit)}>
              Request a change to this visit
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PatientVisitDialog;
