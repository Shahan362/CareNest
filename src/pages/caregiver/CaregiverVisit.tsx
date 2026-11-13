import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  Heart,
  LogIn,
  LogOut,
  MapPin,
  Phone,
  StickyNote,
  User,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import CareNotesList from '@/components/care/CareNotesList';
import EmergencyInfo from '@/components/caregiver/EmergencyInfo';
import { ErrorState, LoadingState } from '@/components/admin/DataState';
import {
  useAddCareNote,
  useCareNotes,
  useCheckIn,
  useCheckOut,
  useMyPatients,
  useMyVisit,
  useReportNoAccess,
} from '@/hooks/data/useCaregiverData';
import type { MyPatientRow, VisitRow } from '@/lib/database.types';
import { ageFromDob, capitalize, formatTime, fullName } from '@/lib/format';
import { STATUS_LABEL, STATUS_STYLE, durationLabel, durationMinutes } from '@/lib/visits';
import { CHECK_IN_EARLY_MINUTES, checkInState, hoursLabel, isLate, mapsUrl, minutesBetween } from '@/lib/caregiver';
import { cn } from '@/lib/utils';

// ---------- Draft (so a half-written note survives a page reload or lost signal) ----------

interface Draft {
  tasksDone: string[];
  note: string;
  concern: boolean;
}

const draftKey = (id: string) => `carenest:visit-draft:${id}`;

function loadDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function saveDraft(id: string, d: Draft) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(d));
  } catch {
    // Storage blocked (private mode): the draft just isn't kept.
  }
}

function clearDraft(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    // ignore
  }
}

// ---------- Patient panel ----------

const PatientPanel: React.FC<{ patient: MyPatientRow | null }> = ({ patient }) => {
  if (!patient) {
    return <p className="text-sm text-muted-foreground">Patient details are not available. Please contact the office.</p>;
  }
  const age = ageFromDob(patient.date_of_birth);
  const map = mapsUrl(patient.address, patient.postcode);
  const icon = 'h-4 w-4 text-primary flex-shrink-0 mt-0.5';

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start gap-2">
        <User className={icon} />
        <div>
          <Link to={`/caregiver/patients/${patient.id}`} className="font-medium text-primary hover:underline">
            {fullName(patient)}
          </Link>
          {age !== null && <span className="text-gray-600"> · {age} years</span>}
        </div>
      </div>
      {(patient.address || patient.postcode) && (
        <div className="flex items-start gap-2">
          <MapPin className={icon} />
          <div>
            <p>{[patient.address, patient.postcode].filter(Boolean).join(', ')}</p>
            {map && (
              <a href={map} target="_blank" rel="noreferrer" className="text-primary font-medium hover:underline">
                Open in maps
              </a>
            )}
          </div>
        </div>
      )}
      {patient.phone && (
        <div className="flex items-start gap-2">
          <Phone className={icon} />
          <a href={`tel:${patient.phone.replace(/\s/g, '')}`} className="text-primary font-medium hover:underline">
            {patient.phone}
          </a>
        </div>
      )}
      <div className="flex items-start gap-2">
        <Heart className={icon} />
        <span>{capitalize(patient.care_plan)} care plan</span>
      </div>
      <EmergencyInfo patient={patient} />
      {patient.notes && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900 mb-1">Care instructions from the office</p>
          <p className="whitespace-pre-wrap text-gray-800">{patient.notes}</p>
        </div>
      )}
    </div>
  );
};

// ---------- No access dialog ----------

const NO_ACCESS_REASONS = [
  'No answer at the door',
  'Patient refused care',
  'Patient is in hospital',
  'Patient was out',
];

const NoAccessDialog: React.FC<{ visit: VisitRow; open: boolean; onOpenChange: (o: boolean) => void }> = ({
  visit,
  open,
  onOpenChange,
}) => {
  const report = useReportNoAccess();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');

  const submit = async () => {
    const text = [reason, details.trim()].filter(Boolean).join('. ');
    if (text.length < 5) return toast.error('Please choose a reason or say what happened.');
    try {
      await report.mutateAsync({ visitId: visit.id, reason: text });
      clearDraft(visit.id);
      toast.success('Reported to the office');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Could not carry out the visit</DialogTitle>
          <DialogDescription>
            The visit will be marked as missed and the office will be alerted to follow up. If you are worried about the
            patient's safety, call the office or 999 first.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {NO_ACCESS_REASONS.map((r) => (
              <Button
                key={r}
                type="button"
                variant={reason === r ? 'default' : 'outline'}
                className="justify-start h-auto py-2 whitespace-normal text-left"
                onClick={() => setReason(r)}
              >
                {r}
              </Button>
            ))}
          </div>
          <div>
            <Label htmlFor="no-access-details">Details</Label>
            <Textarea
              id="no-access-details"
              rows={3}
              placeholder="e.g. Waited 10 minutes, called the patient twice, neighbour says they went out."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button variant="destructive" onClick={submit} disabled={report.isPending}>
            {report.isPending ? 'Sending...' : 'Report to office'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Check-out form ----------

const CheckOutForm: React.FC<{ visit: VisitRow }> = ({ visit }) => {
  const checkOut = useCheckOut();
  const [draft, setDraft] = useState<Draft>(() => loadDraft(visit.id) ?? { tasksDone: [], note: '', concern: false });
  const [error, setError] = useState<string | null>(null);
  const [confirmMissing, setConfirmMissing] = useState(false);

  useEffect(() => saveDraft(visit.id, draft), [visit.id, draft]);

  const toggle = (task: string) => {
    setConfirmMissing(false);
    setError(null);
    setDraft((d) => ({
      ...d,
      tasksDone: d.tasksDone.includes(task) ? d.tasksDone.filter((t) => t !== task) : [...d.tasksDone, task],
    }));
  };

  const missing = visit.tasks.filter((t) => !draft.tasksDone.includes(t));

  const submit = async () => {
    setError(null);
    const note = draft.note.trim();
    if (note.length < 10) return setError('Please write a care note (at least 10 characters) before checking out.');
    if (missing.length > 0 && !confirmMissing) {
      setConfirmMissing(true);
      return setError(
        `Not ticked: ${missing.join(', ')}. Make sure your note says why, then press the button again to check out.`,
      );
    }
    try {
      await checkOut.mutateAsync({ visitId: visit.id, tasksDone: draft.tasksDone, note, concern: draft.concern });
      clearDraft(visit.id);
      toast.success('Checked out. Visit completed.');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      {visit.tasks.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Tasks</h3>
          <div className="space-y-1">
            {visit.tasks.map((task) => {
              const done = draft.tasksDone.includes(task);
              return (
                <button
                  key={task}
                  type="button"
                  onClick={() => toggle(task)}
                  className="w-full flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-gray-50"
                >
                  {done ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5 text-gray-400" />}
                  <span className={cn(done && 'text-gray-500 line-through')}>{task}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="care-note" className="font-semibold">Care note</Label>
        <p className="text-xs text-muted-foreground mb-2">
          How was the patient? What did you do, what did they eat and drink, any changes in health or mood?
        </p>
        <Textarea
          id="care-note"
          rows={5}
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          placeholder="e.g. Mrs Patel was in good spirits. Helped with a shower and dressing. Morning tablets taken from the blister pack at 08:20. Ate porridge and a cup of tea."
        />
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 cursor-pointer">
        <Checkbox
          checked={draft.concern}
          onCheckedChange={(c) => setDraft({ ...draft, concern: c === true })}
          className="mt-0.5"
        />
        <span className="text-sm">
          <span className="font-medium">Raise a concern with the office</span>
          <span className="block text-gray-600">e.g. a fall, a new injury, not eating, low on medication, a safeguarding worry.</span>
        </span>
      </label>

      {error && <p className="text-sm font-medium text-destructive">{error}</p>}

      <Button className="w-full sm:w-auto" size="lg" onClick={submit} disabled={checkOut.isPending}>
        <LogOut className="h-4 w-4 mr-2" />
        {checkOut.isPending ? 'Checking out...' : confirmMissing && missing.length > 0 ? 'Check out anyway' : 'Check out and complete visit'}
      </Button>
    </div>
  );
};

// ---------- Extra note (after the visit) ----------

const AddNoteForm: React.FC<{ visit: VisitRow }> = ({ visit }) => {
  const add = useAddCareNote();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [concern, setConcern] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <StickyNote className="h-4 w-4 mr-2" />
        Add a note
      </Button>
    );
  }

  const submit = async () => {
    if (body.trim().length < 5) return toast.error('Please write a little more.');
    try {
      await add.mutateAsync({ patientId: visit.patient_id, visitId: visit.id, body, concern });
      toast.success('Note added');
      setBody('');
      setConcern(false);
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Something you forgot to mention, or a correction." />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={concern} onCheckedChange={(c) => setConcern(c === true)} />
        Raise as a concern with the office
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={add.isPending}>{add.isPending ? 'Saving...' : 'Save note'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      <p className="text-xs text-muted-foreground">Care notes can't be edited or deleted once saved. Add a new note to correct something.</p>
    </div>
  );
};

// ---------- Page ----------

const CaregiverVisit: React.FC = () => {
  const { visitId } = useParams();
  const visitQ = useMyVisit(visitId);
  const patientsQ = useMyPatients();
  const visit = visitQ.data;
  const notesQ = useCareNotes({ patientId: visit?.patient_id }, 10);
  const checkIn = useCheckIn();
  const [noAccessOpen, setNoAccessOpen] = useState(false);

  // Re-render every 30s so "too early" turns into the check-in button without a refresh.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const wrap = (content: React.ReactNode) => (
    <Layout title="Visit" role="caregiver">
      <Link to="/caregiver" className="inline-flex items-center text-sm text-primary font-medium mb-4 hover:underline">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Link>
      {content}
    </Layout>
  );

  if (visitQ.isLoading || patientsQ.isLoading) return wrap(<LoadingState />);
  if (visitQ.error) return wrap(<div className="bg-white rounded-lg border"><ErrorState error={visitQ.error} onRetry={visitQ.refetch} /></div>);
  if (!visit) {
    return wrap(
      <div className="bg-white rounded-lg border p-8 text-center">
        <p className="font-medium">Visit not found</p>
        <p className="text-sm text-muted-foreground mt-1">It may have been reassigned to someone else or removed by the office.</p>
      </div>,
    );
  }

  const patient = patientsQ.data?.find((p) => p.id === visit.patient_id) ?? null;
  const start = parseISO(visit.start_time);
  const end = parseISO(visit.end_time);
  const ci = checkInState(visit, now);
  const late = isLate(visit, now);
  const canReportNoAccess = (visit.status === 'scheduled' && ci !== 'too_early') || visit.status === 'in_progress';

  const doCheckIn = async () => {
    try {
      await checkIn.mutateAsync(visit.id);
      toast.success(`Checked in at ${format(new Date(), 'HH:mm')}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return wrap(
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Visit header */}
        <section className="bg-white rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold">{patient ? fullName(patient) : 'Visit'}</h2>
              <p className="text-gray-600 flex items-center gap-1 mt-1">
                <Clock className="h-4 w-4" />
                {format(start, 'EEEE d MMMM')} · {formatTime(start)}–{formatTime(end)} ({durationLabel(durationMinutes(visit))})
              </p>
            </div>
            <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border', STATUS_STYLE[visit.status])}>
              {STATUS_LABEL[visit.status]}
            </span>
          </div>
          {(visit.checked_in_at || visit.checked_out_at) && (
            <p className="text-sm text-gray-700 mt-3">
              {visit.checked_in_at && <>Checked in {formatTime(visit.checked_in_at)}</>}
              {visit.checked_in_at && visit.checked_out_at && <> · checked out {formatTime(visit.checked_out_at)}</>}
              {visit.checked_in_at && visit.checked_out_at && (
                <> · {hoursLabel(minutesBetween(visit.checked_in_at, visit.checked_out_at))} on site</>
              )}
            </p>
          )}
          {visit.notes && (
            <div className="mt-3 rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm">
              <p className="text-xs font-semibold text-blue-900 mb-1">Note for this visit</p>
              <p className="whitespace-pre-wrap">{visit.notes}</p>
            </div>
          )}
        </section>

        {/* What to do now */}
        <section className="bg-white rounded-lg border p-4">
          {visit.status === 'scheduled' && (
            <div className="space-y-3">
              {ci === 'open' && (
                <>
                  {late && (
                    <p className="flex items-center gap-2 text-sm font-medium text-red-700">
                      <AlertTriangle className="h-4 w-4" /> You are running late. The office can see this.
                    </p>
                  )}
                  <p className="text-sm text-gray-600">Check in when you arrive at the patient's home.</p>
                  <Button size="lg" onClick={doCheckIn} disabled={checkIn.isPending}>
                    <LogIn className="h-4 w-4 mr-2" />
                    {checkIn.isPending ? 'Checking in...' : 'Check in'}
                  </Button>
                </>
              )}
              {ci === 'too_early' && (
                <p className="text-sm text-gray-600">
                  You can check in from {format(new Date(start.getTime() - CHECK_IN_EARLY_MINUTES * 60_000), 'HH:mm')}
                  {format(start, 'yyyy-MM-dd') !== format(now, 'yyyy-MM-dd') && <> on {format(start, 'EEEE d MMMM')}</>}.
                </p>
              )}
              {ci === 'too_late' && (
                <p className="text-sm text-gray-600">
                  This visit ended more than 4 hours ago without a check-in. Please contact the office so they can record what happened.
                </p>
              )}
            </div>
          )}

          {visit.status === 'in_progress' && <CheckOutForm visit={visit} />}

          {visit.status === 'completed' && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 font-medium text-green-700">
                <CheckCircle2 className="h-5 w-5" /> Visit completed
              </p>
              {visit.tasks.length > 0 && (
                <ul className="text-sm space-y-1">
                  {visit.tasks.map((t) => {
                    const done = visit.tasks_done.includes(t);
                    return (
                      <li key={t} className="flex items-center gap-2">
                        {done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-gray-400" />}
                        <span className={cn(!done && 'text-gray-500')}>{t}{!done && ' (not done)'}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <AddNoteForm visit={visit} />
            </div>
          )}

          {visit.status === 'missed' && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 font-medium text-red-700">
                <Ban className="h-5 w-5" /> This visit was missed. The office has been told.
              </p>
              <AddNoteForm visit={visit} />
            </div>
          )}

          {visit.status === 'cancelled' && (
            <p className="text-sm text-gray-600">The office cancelled this visit. You don't need to go.</p>
          )}

          {canReportNoAccess && (
            <div className="mt-4 pt-4 border-t">
              <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setNoAccessOpen(true)}>
                <Ban className="h-4 w-4 mr-2" />
                Couldn't get in / patient refused care
              </Button>
            </div>
          )}
        </section>

        {/* Care record */}
        <section className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold mb-3">Recent care notes</h3>
          {notesQ.isLoading ? (
            <LoadingState />
          ) : notesQ.error ? (
            <ErrorState error={notesQ.error} onRetry={notesQ.refetch} />
          ) : (
            <CareNotesList notes={notesQ.data ?? []} emptyText="No care notes for this patient yet." />
          )}
          {patient && (
            <Link to={`/caregiver/patients/${patient.id}`} className="inline-block mt-3 text-sm text-primary font-medium hover:underline">
              See full care record
            </Link>
          )}
        </section>
      </div>

      <aside className="bg-white rounded-lg border p-4 h-fit">
        <h3 className="font-semibold mb-3">Patient</h3>
        <PatientPanel patient={patient} />
      </aside>

      <NoAccessDialog visit={visit} open={noAccessOpen} onOpenChange={setNoAccessOpen} />
    </div>,
  );
};

export default CaregiverVisit;
