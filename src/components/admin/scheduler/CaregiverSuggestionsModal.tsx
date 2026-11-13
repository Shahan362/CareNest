import React, { useMemo } from 'react';
import { endOfWeek, startOfWeek } from 'date-fns';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Loader2, MapPin, Star, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useCaregiverRows, usePatientRows, useSaveVisit, useVisitRows } from '@/hooks/data/useAgencyData';
import type { VisitView } from '@/hooks/useAdminViews';
import { formatDate, formatTime, fullName, initials } from '@/lib/format';
import { findConflicts, isActiveVisit } from '@/lib/visits';

interface CaregiverSuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  visit: VisitView | null;
}

/**
 * Ranks active caregivers for a visit:
 * 1. free at that time, 2. the patient's primary caregiver, 3. most hours left this week.
 */
const CaregiverSuggestionsModal: React.FC<CaregiverSuggestionsModalProps> = ({ isOpen, onClose, visit }) => {
  const { data: caregivers = [] } = useCaregiverRows();
  const { data: patients = [] } = usePatientRows();
  const save = useSaveVisit();

  const weekFrom = visit ? startOfWeek(visit.start, { weekStartsOn: 1 }).toISOString() : '';
  const weekTo = visit ? endOfWeek(visit.start, { weekStartsOn: 1 }).toISOString() : '';
  const weekVisits = useVisitRows(weekFrom, weekTo);

  const ranked = useMemo(() => {
    if (!visit) return [];
    const all = weekVisits.data ?? [];
    const primaryId = patients.find((p) => p.id === visit.row.patient_id)?.primary_caregiver_id;

    return caregivers
      .filter((c) => c.status === 'active')
      .map((c) => {
        const conflicts = findConflicts(all, c.id, visit.start, visit.end, visit.row.id);
        const hours =
          all
            .filter((v) => v.caregiver_id === c.id && isActiveVisit(v) && v.id !== visit.row.id)
            .reduce((t, v) => t + (new Date(v.end_time).getTime() - new Date(v.start_time).getTime()) / 3_600_000, 0);
        const max = Number(c.max_hours_per_week);
        const hoursLeft = max - hours;
        const fitsHours = hoursLeft >= visit.minutes / 60;
        const isPrimary = c.id === primaryId;
        const score = (conflicts.length === 0 ? 1000 : 0) + (isPrimary ? 100 : 0) + (fitsHours ? 50 : 0) + hoursLeft;
        return { c, conflicts, hours: Math.round(hours * 10) / 10, max, fitsHours, isPrimary, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [visit, caregivers, patients, weekVisits.data]);

  const assign = async (caregiverId: string, name: string) => {
    if (!visit) return;
    try {
      await save.mutateAsync({ id: visit.row.id, input: { caregiver_id: caregiverId } });
      toast.success(`Visit assigned to ${name}`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!visit) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose a caregiver</DialogTitle>
        </DialogHeader>

        <div className="bg-muted/50 rounded-lg p-3 text-sm">
          <span className="font-medium">{visit.patientName}</span> · {formatDate(visit.start)}{' '}
          {formatTime(visit.start)}-{formatTime(visit.end)}
          {visit.row.tasks.length > 0 && <span className="text-muted-foreground"> · {visit.row.tasks.join(', ')}</span>}
        </div>

        {weekVisits.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking availability...
          </div>
        ) : ranked.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No active caregivers. Add one on the Caregivers page.</p>
        ) : (
          <div className="space-y-3">
            {ranked.map(({ c, conflicts, hours, max, fitsHours, isPrimary }) => {
              const free = conflicts.length === 0;
              const pct = max > 0 ? Math.min(100, (hours / max) * 100) : 100;
              return (
                <div key={c.id} className={`border rounded-lg p-3 ${free ? '' : 'opacity-70'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                        {initials(c)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium">{fullName(c)}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {isPrimary && (
                            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                              <Star className="h-3 w-3 mr-1" />Primary caregiver
                            </Badge>
                          )}
                          {free ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              <CheckCircle2 className="h-3 w-3 mr-1" />Free at this time
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                              <XCircle className="h-3 w-3 mr-1" />Booked {formatTime(conflicts[0].start_time)}-{formatTime(conflicts[0].end_time)}
                            </Badge>
                          )}
                          {!fitsHours && (
                            <Badge variant="outline" className="text-orange-700">Over weekly hours</Badge>
                          )}
                          {c.specialty && <Badge variant="secondary">{c.specialty}</Badge>}
                          {c.region && (
                            <Badge variant="outline"><MapPin className="h-3 w-3 mr-1" />{c.region}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={free ? 'default' : 'outline'}
                      disabled={save.isPending}
                      onClick={() => assign(c.id, fullName(c))}
                    >
                      {free ? 'Assign' : 'Assign anyway'}
                    </Button>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />This week</span>
                      <span>{hours}/{max}h</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CaregiverSuggestionsModal;
