import React from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Calendar, CheckCircle2, Circle, Clock, ListChecks, LogIn, NotebookPen, Pencil, StickyNote, User, UserCheck, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSaveVisit } from '@/hooks/data/useAgencyData';
import type { VisitView } from '@/hooks/useAdminViews';
import type { VisitStatus } from '@/lib/database.types';
import { formatDate, formatTime } from '@/lib/format';
import { STATUS_LABEL, STATUS_STYLE, durationLabel } from '@/lib/visits';
import { cn } from '@/lib/utils';
import CareNotesList from '@/components/care/CareNotesList';
import { useCareNotes } from '@/hooks/data/useCaregiverData';
import { hoursLabel, isLate, minutesBetween } from '@/lib/caregiver';

interface VisitDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: VisitView | null;
  onEdit: (visit: VisitView) => void;
  /** Shown for unassigned visits: opens caregiver suggestions. */
  onFindCaregiver?: (visit: VisitView) => void;
}

const Row: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
    <div className="mt-0.5">{icon}</div>
    <div className="min-w-0">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <div className="text-gray-900">{children}</div>
    </div>
  </div>
);

const VisitDetailsDialog: React.FC<VisitDetailsDialogProps> = ({ open, onOpenChange, visit, onEdit, onFindCaregiver }) => {
  const save = useSaveVisit();
  const notes = useCareNotes({ visitId: open ? visit?.row.id : undefined });
  if (!visit) return null;

  const setStatus = async (status: VisitStatus, message: string) => {
    try {
      await save.mutateAsync({ id: visit.row.id, input: { status } });
      toast.success(message);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const icon = 'h-5 w-5 text-primary';
  const { status } = visit.row;
  const isOpen = status === 'scheduled' || status === 'in_progress';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span>Visit Details</span>
            <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border', STATUS_STYLE[status])}>
              {STATUS_LABEL[status]}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <Row icon={<User className={icon} />} label="Patient">{visit.patientName}</Row>
          <Row icon={<UserCheck className={icon} />} label="Caregiver">
            {visit.caregiverName ?? <span className="text-orange-700">Not assigned yet</span>}
          </Row>
          <Row icon={<Calendar className={icon} />} label="Date">{formatDate(visit.start)}</Row>
          <Row icon={<Clock className={icon} />} label="Time">
            {formatTime(visit.start)}-{formatTime(visit.end)} ({durationLabel(visit.minutes)})
          </Row>
          {isLate(visit.row) && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-800 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              Not checked in yet. The caregiver is late or forgot to check in.
            </div>
          )}
          {visit.row.checked_in_at && (
            <Row icon={<LogIn className={icon} />} label="Actual time (caregiver check-in / out)">
              {formatTime(visit.row.checked_in_at)}
              {visit.row.checked_out_at ? (
                <>-{formatTime(visit.row.checked_out_at)} ({hoursLabel(minutesBetween(visit.row.checked_in_at, visit.row.checked_out_at))})</>
              ) : (
                ' - still on site'
              )}
            </Row>
          )}
          {visit.row.tasks.length > 0 && (
            <Row icon={<ListChecks className={icon} />} label={status === 'completed' ? 'Care tasks (ticked by caregiver)' : 'Care tasks'}>
              <div className="flex flex-wrap gap-1 mt-1">
                {visit.row.tasks.map((t) => {
                  const done = visit.row.tasks_done?.includes(t);
                  return (
                    <span key={t} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border text-xs', status === 'completed' && !done && 'text-red-700 border-red-200')}>
                      {status === 'completed' && (done ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Circle className="h-3 w-3" />)}
                      {t}
                    </span>
                  );
                })}
              </div>
            </Row>
          )}
          {visit.row.notes && (
            <Row icon={<StickyNote className={icon} />} label="Notes">
              <p className="whitespace-pre-wrap">{visit.row.notes}</p>
            </Row>
          )}
        </div>

        {(notes.data?.length ?? 0) > 0 && (
          <div className="pt-1">
            <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <NotebookPen className="h-4 w-4 text-primary" /> Care notes from this visit
            </p>
            <CareNotesList notes={notes.data ?? []} />
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" onClick={() => onEdit(visit)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
          {!visit.row.caregiver_id && isOpen && onFindCaregiver && (
            <Button onClick={() => onFindCaregiver(visit)}>
              <UserCheck className="h-4 w-4 mr-2" />
              Find caregiver
            </Button>
          )}
          {isOpen && (
            <>
              <Button
                variant="outline"
                className="text-green-700"
                disabled={save.isPending}
                onClick={() => setStatus('completed', 'Visit marked as completed')}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark completed
              </Button>
              <Button
                variant="outline"
                className="text-red-700"
                disabled={save.isPending}
                onClick={() => setStatus('cancelled', 'Visit cancelled')}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel visit
              </Button>
            </>
          )}
          {status === 'cancelled' && (
            <Button variant="outline" disabled={save.isPending} onClick={() => setStatus('scheduled', 'Visit restored')}>
              Restore visit
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VisitDetailsDialog;
