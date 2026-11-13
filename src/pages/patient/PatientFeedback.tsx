import React, { useState } from 'react';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import NotLinkedNotice from '@/components/caregiver/NotLinkedNotice';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { useMyCaregivers, useMyPatient } from '@/hooks/data/usePatientData';
import { useFeedback, useGiveFeedback } from '@/hooks/data/useRequests';
import type { FeedbackKind } from '@/lib/database.types';
import { formatDateTime } from '@/lib/format';
import { FEEDBACK_KINDS, FEEDBACK_KIND_LABEL, FEEDBACK_KIND_STYLE, carerName } from '@/lib/requests';
import { cn } from '@/lib/utils';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Compliments, suggestions and complaints to the agency, with the office's reply. */
const PatientFeedback: React.FC = () => {
  const me = useMyPatient();
  const caregivers = useMyCaregivers();
  const feedback = useFeedback();
  const give = useGiveFeedback();
  const [kind, setKind] = useState<FeedbackKind>('compliment');
  const [caregiverId, setCaregiverId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const carerById = new Map((caregivers.data ?? []).map((c) => [c.id, c]));
  const hint = FEEDBACK_KINDS.find((k) => k.value === kind)!.hint;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (message.trim().length < 10) return setError('Please write a little more (at least 10 characters).');
    try {
      await give.mutateAsync({ patientId: me.data!.id, kind, message, caregiverId: caregiverId || null });
      toast.success(kind === 'complaint' ? 'Complaint sent. The office will reply.' : 'Thank you for your feedback');
      setMessage('');
      setCaregiverId('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (me.data === null) {
    return <Layout title="Feedback" role="patient"><NotLinkedNotice who="patient" /></Layout>;
  }

  return (
    <Layout title="Feedback" role="patient">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <form onSubmit={submit} className="lg:col-span-2 bg-white rounded-lg border p-4 space-y-4 h-fit" noValidate>
          <h2 className="text-lg font-bold">Tell us how we're doing</h2>
          <div className="grid grid-cols-3 gap-2">
            {FEEDBACK_KINDS.map((k) => (
              <Button key={k.value} type="button" variant={kind === k.value ? 'default' : 'outline'} onClick={() => setKind(k.value)}>
                {k.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground -mt-2">{hint}</p>

          <div>
            <Label htmlFor="fb-carer">About a carer (optional)</Label>
            <select id="fb-carer" className={selectClass} value={caregiverId} onChange={(e) => setCaregiverId(e.target.value)}>
              <option value="">The agency in general</option>
              {(caregivers.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{carerName(c)}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="fb-message">Your message</Label>
            <Textarea
              id="fb-message"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={kind === 'complaint' ? 'What happened, and when? What would you like us to do?' : 'Write your message here.'}
            />
          </div>

          {kind === 'complaint' && (
            <p className="text-xs text-muted-foreground">
              If you're not happy with how we handle your complaint, you can contact the Local Government and Social Care
              Ombudsman. You can also share your experience with the CQC.
            </p>
          )}
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" disabled={give.isPending || !me.data}>{give.isPending ? 'Sending...' : 'Send'}</Button>
        </form>

        <section className="lg:col-span-3">
          <h2 className="text-lg font-bold mb-3">What you've sent</h2>
          {feedback.isLoading ? (
            <LoadingState />
          ) : feedback.error ? (
            <div className="bg-white rounded-lg border"><ErrorState error={feedback.error} onRetry={feedback.refetch} /></div>
          ) : (feedback.data ?? []).length === 0 ? (
            <div className="bg-white rounded-lg border"><EmptyState title="Nothing sent yet" /></div>
          ) : (
            <ul className="space-y-3">
              {feedback.data!.map((f) => (
                <li key={f.id} className="bg-white rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border', FEEDBACK_KIND_STYLE[f.kind])}>
                      {FEEDBACK_KIND_LABEL[f.kind]}
                      {f.caregiver_id && ` · ${carerName(carerById.get(f.caregiver_id))}`}
                    </span>
                    <span className="text-xs text-gray-500">{formatDateTime(f.created_at)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{f.message}</p>
                  {f.admin_response ? (
                    <div className="mt-3 rounded-lg bg-gray-50 border p-3 text-sm">
                      <p className="text-xs font-semibold text-gray-600 mb-1">Reply from the office</p>
                      <p className="whitespace-pre-wrap">{f.admin_response}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-2">{f.status === 'resolved' ? 'Seen by the office.' : 'Waiting for the office to read it.'}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
};

export default PatientFeedback;
