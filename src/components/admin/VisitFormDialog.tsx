import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  useCaregiverRows,
  useCaregiverVisits,
  useCreateVisits,
  useDeleteVisit,
  usePatientRows,
  useSaveVisit,
} from '@/hooks/data/useAgencyData';
import type { VisitRow, VisitStatus } from '@/lib/database.types';
import { formatDate, formatTime, fullName } from '@/lib/format';
import {
  CARE_TASKS,
  DURATIONS,
  REPEAT_OPTIONS,
  STATUS_LABEL,
  combineDateTime,
  durationLabel,
  durationMinutes,
  findConflicts,
  repeatStarts,
  toDateInput,
  toTimeInput,
  type RepeatRule,
} from '@/lib/visits';

const schema = z.object({
  patient_id: z.string().min(1, 'Please choose a patient.'),
  caregiver_id: z.string(),
  date: z.string().min(1, 'Please choose a date.'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Please choose a start time.'),
  duration: z.coerce.number().min(5),
  tasks: z.array(z.string()),
  notes: z.string(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled', 'missed']),
  repeat: z.enum(['none', 'daily', 'weekdays', 'weekly']),
  repeatWeeks: z.coerce.number().int().min(1).max(12),
});

type FormValues = z.infer<typeof schema>;

export interface VisitDefaults {
  patientId?: string;
  caregiverId?: string;
  date?: string;
  time?: string;
}

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface VisitFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a visit to edit it; leave empty to create one. */
  visit?: VisitRow | null;
  /** Pre-filled values when creating (e.g. from a clicked calendar slot). */
  defaults?: VisitDefaults;
}

const VisitFormDialog: React.FC<VisitFormDialogProps> = ({ open, onOpenChange, visit, defaults }) => {
  const isEdit = !!visit;
  const { data: patients = [] } = usePatientRows();
  const { data: caregivers = [] } = useCaregiverRows();
  const save = useSaveVisit();
  const createMany = useCreateVisits();
  const remove = useDeleteVisit();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const newVisitValues = (): FormValues => ({
    patient_id: defaults?.patientId ?? '',
    caregiver_id: defaults?.caregiverId ?? '',
    date: defaults?.date ?? toDateInput(new Date()),
    time: defaults?.time ?? '09:00',
    duration: 60,
    tasks: [],
    notes: '',
    status: 'scheduled',
    repeat: 'none',
    repeatWeeks: 4,
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: newVisitValues() });

  useEffect(() => {
    if (!open) return;
    form.reset(
      visit
        ? {
            patient_id: visit.patient_id,
            caregiver_id: visit.caregiver_id ?? '',
            date: toDateInput(visit.start_time),
            time: toTimeInput(visit.start_time),
            duration: durationMinutes(visit),
            tasks: visit.tasks ?? [],
            notes: visit.notes ?? '',
            status: visit.status,
            repeat: 'none',
            repeatWeeks: 4,
          }
        : newVisitValues(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visit, defaults, form]);

  const values = form.watch();

  // Every start time this form would create (more than one when repeating).
  const starts = useMemo(() => {
    if (!values.date || !/^\d{2}:\d{2}$/.test(values.time ?? '')) return [];
    const first = combineDateTime(values.date, values.time);
    if (isNaN(first.getTime())) return [];
    return isEdit ? [first] : repeatStarts(first, values.repeat as RepeatRule, Number(values.repeatWeeks) || 1);
  }, [values.date, values.time, values.repeat, values.repeatWeeks, isEdit]);

  const durationMs = (Number(values.duration) || 60) * 60000;
  const rangeFrom = starts[0]?.toISOString() ?? '';
  const rangeTo = starts.length ? new Date(starts[starts.length - 1].getTime() + durationMs).toISOString() : '';
  const { data: caregiverVisits = [] } = useCaregiverVisits(
    values.caregiver_id && rangeFrom ? values.caregiver_id : null,
    rangeFrom,
    rangeTo,
  );

  const conflicts = useMemo(() => {
    if (!values.caregiver_id || values.status === 'cancelled') return [];
    return starts.flatMap((s) =>
      findConflicts(caregiverVisits, values.caregiver_id, s, new Date(s.getTime() + durationMs), visit?.id),
    );
  }, [starts, caregiverVisits, values.caregiver_id, values.status, durationMs, visit?.id]);

  // When a patient is picked on a new visit, suggest their primary caregiver.
  const onPatientChange = (patientId: string) => {
    form.setValue('patient_id', patientId, { shouldValidate: true });
    if (!isEdit && !form.getValues('caregiver_id')) {
      const primary = patients.find((p) => p.id === patientId)?.primary_caregiver_id;
      if (primary) form.setValue('caregiver_id', primary);
    }
  };

  const onSubmit = async (v: FormValues) => {
    const base = {
      patient_id: v.patient_id,
      caregiver_id: v.caregiver_id || null,
      tasks: v.tasks,
      notes: v.notes,
    };
    try {
      if (isEdit && visit) {
        const start = combineDateTime(v.date, v.time);
        await save.mutateAsync({
          id: visit.id,
          input: {
            ...base,
            status: v.status as VisitStatus,
            start_time: start.toISOString(),
            end_time: new Date(start.getTime() + v.duration * 60000).toISOString(),
          },
        });
        toast.success('Visit updated');
      } else {
        await createMany.mutateAsync(
          starts.map((s) => ({
            ...base,
            status: 'scheduled' as VisitStatus,
            start_time: s.toISOString(),
            end_time: new Date(s.getTime() + v.duration * 60000).toISOString(),
          })),
        );
        toast.success(starts.length > 1 ? `${starts.length} visits scheduled` : 'Visit scheduled');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onDelete = async () => {
    if (!visit) return;
    try {
      await remove.mutateAsync(visit.id);
      toast.success('Visit deleted');
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const c = form.control;
  const busy = save.isPending || createMany.isPending;
  const durationOptions = DURATIONS.some((d) => d.minutes === Number(values.duration))
    ? DURATIONS
    : [...DURATIONS, { minutes: Number(values.duration), label: durationLabel(Number(values.duration)) }];
  const selectablePatients = patients.filter((p) => p.status === 'active' || p.id === visit?.patient_id);
  const selectableCaregivers = caregivers.filter((cg) => cg.status === 'active' || cg.id === visit?.caregiver_id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit Visit' : 'Schedule Visit'}</DialogTitle>
          </DialogHeader>

          {patients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Add a patient first, then you can schedule visits for them.</p>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-2" noValidate>
                <FormField
                  control={c}
                  name="patient_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Patient</FormLabel>
                      <FormControl>
                        <select className={selectClass} value={field.value ?? ''} onChange={(e) => onPatientChange(e.target.value)}>
                          <option value="">Choose a patient</option>
                          {selectablePatients.map((p) => (
                            <option key={p.id} value={p.id}>
                              {fullName(p)}
                              {p.postcode ? ` (${p.postcode})` : ''}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={c}
                  name="caregiver_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Caregiver</FormLabel>
                      <FormControl>
                        <select className={selectClass} {...field} value={field.value ?? ''}>
                          <option value="">Unassigned (assign later)</option>
                          {selectableCaregivers.map((cg) => (
                            <option key={cg.id} value={cg.id}>
                              {fullName(cg)}
                              {cg.specialty ? ` - ${cg.specialty}` : ''}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={c}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={c}
                    name="time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start</FormLabel>
                        <FormControl>
                          <Input type="time" step={900} {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={c}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Length</FormLabel>
                        <FormControl>
                          <select className={selectClass} {...field} value={field.value ?? 60}>
                            {durationOptions.map((d) => (
                              <option key={d.minutes} value={d.minutes}>
                                {d.label}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {!isEdit && (
                  <div className="grid grid-cols-3 gap-3">
                    <FormField
                      control={c}
                      name="repeat"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Repeat</FormLabel>
                          <FormControl>
                            <select className={selectClass} {...field} value={field.value ?? 'none'}>
                              {REPEAT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    {values.repeat !== 'none' && (
                      <FormField
                        control={c}
                        name="repeatWeeks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>For</FormLabel>
                            <FormControl>
                              <select className={selectClass} {...field} value={field.value ?? 4}>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                                  <option key={n} value={n}>
                                    {n} week{n > 1 ? 's' : ''}
                                  </option>
                                ))}
                              </select>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                )}
                {!isEdit && starts.length > 1 && (
                  <p className="text-xs text-muted-foreground -mt-2">
                    This creates {starts.length} visits, from {formatDate(starts[0])} to {formatDate(starts[starts.length - 1])}.
                  </p>
                )}

                {isEdit && (
                  <FormField
                    control={c}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <FormControl>
                          <select className={selectClass} {...field} value={field.value ?? 'scheduled'}>
                            {(Object.keys(STATUS_LABEL) as VisitStatus[]).map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={c}
                  name="tasks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Care tasks</FormLabel>
                      <div className="grid grid-cols-2 gap-2">
                        {CARE_TASKS.map((task) => {
                          const checked = (field.value ?? []).includes(task);
                          return (
                            <label key={task} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(on) =>
                                  field.onChange(
                                    on ? [...(field.value ?? []), task] : (field.value ?? []).filter((t) => t !== task),
                                  )
                                }
                              />
                              {task}
                            </label>
                          );
                        })}
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={c}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea rows={2} placeholder="Anything the caregiver should know" {...field} value={field.value ?? ''} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {conflicts.length > 0 && (
                  <div className="flex gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">This caregiver is already booked at that time</p>
                      <ul className="mt-1 list-disc pl-4">
                        {conflicts.slice(0, 3).map((cv) => (
                          <li key={cv.id}>
                            {formatDate(cv.start_time)} {formatTime(cv.start_time)}-{formatTime(cv.end_time)}
                          </li>
                        ))}
                        {conflicts.length > 3 && <li>and {conflicts.length - 3} more</li>}
                      </ul>
                      <p className="mt-1">You can still save, or pick another caregiver or time.</p>
                    </div>
                  </div>
                )}

                <DialogFooter className="gap-2 sm:justify-between">
                  {isEdit ? (
                    <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
                      Delete
                    </Button>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={busy}>
                      {busy ? 'Saving...' : conflicts.length > 0 ? 'Save anyway' : isEdit ? 'Save Changes' : 'Schedule'}
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this visit?</AlertDialogTitle>
            <AlertDialogDescription>
              The visit is removed completely. To keep a record (for billing and reports), change its status to Cancelled instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep visit</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {remove.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default VisitFormDialog;
