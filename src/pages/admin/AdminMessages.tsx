import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { ArrowLeft, Plus, Search } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ChatThread from '@/components/messages/ChatThread';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { useMessageContacts, useOfficeThreads } from '@/hooks/data/useMessages';
import { cn } from '@/lib/utils';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const ROLE_LABEL = { caregiver: 'Caregiver', patient: 'Patient' } as const;

/** The office inbox: one conversation per caregiver / patient, shared by all admins. */
const AdminMessages: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const selected = params.get('u');
  const threads = useOfficeThreads();
  const contacts = useMessageContacts();
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(false);

  const select = (id: string | null) => {
    setPicking(false);
    setParams(id ? { u: id } : {});
  };

  const contactName = (c: { first_name: string | null; last_name: string | null; email: string }) =>
    [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email;

  const q = search.trim().toLowerCase();
  const list = (threads.data ?? []).filter((t) => !q || t.name.toLowerCase().includes(q));
  const current =
    (threads.data ?? []).find((t) => t.thread_user_id === selected) ??
    (() => {
      const c = (contacts.data ?? []).find((x) => x.id === selected);
      return c ? { thread_user_id: c.id, name: contactName(c), role: c.role } : null;
    })();

  return (
    <Layout title="Messages" role="admin">
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-10rem)]">
        {/* Conversation list */}
        <section className={cn('bg-white rounded-lg border flex flex-col min-h-0', selected && 'hidden md:flex')}>
          <div className="p-3 border-b space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input className="pl-9" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Button size="icon" variant="outline" aria-label="New message" onClick={() => setPicking((p) => !p)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {picking && (
              <div>
                <select className={selectClass} defaultValue="" onChange={(e) => e.target.value && select(e.target.value)}>
                  <option value="">Message a caregiver or patient...</option>
                  {(contacts.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{contactName(c)} ({ROLE_LABEL[c.role]})</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">Only people who have signed up to the app can receive messages.</p>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {threads.isLoading ? (
              <LoadingState />
            ) : threads.error ? (
              <ErrorState error={threads.error} onRetry={threads.refetch} />
            ) : list.length === 0 ? (
              <EmptyState title={q ? 'No matches' : 'No conversations yet'} description={q ? undefined : 'Caregivers and patients can message the office from their app. Press + to start one.'} />
            ) : (
              <ul className="divide-y">
                {list.map((t) => (
                  <li key={t.thread_user_id}>
                    <button
                      type="button"
                      onClick={() => select(t.thread_user_id)}
                      className={cn('w-full text-left p-3 hover:bg-gray-50', selected === t.thread_user_id && 'bg-primary/5')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn('truncate', t.unread > 0 ? 'font-semibold' : 'font-medium')}>{t.name}</span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatDistanceToNowStrict(parseISO(t.last_at), { addSuffix: false })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-500 truncate">
                          {t.role && `${ROLE_LABEL[t.role]} · `}
                          {t.last_from_office && 'Office: '}
                          {t.last_body}
                        </span>
                        {t.unread > 0 && (
                          <span className="flex-shrink-0 rounded-full bg-primary text-white text-xs px-1.5 min-w-[1.25rem] text-center">{t.unread}</span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Conversation */}
        <section className={cn('flex flex-col min-h-0', !selected && 'hidden md:flex')}>
          {selected && current ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Back" onClick={() => select(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <p className="font-semibold">{current.name}</p>
                  {current.role && <p className="text-xs text-gray-500">{ROLE_LABEL[current.role]} · all admins see this conversation</p>}
                </div>
              </div>
              <ChatThread
                threadUserId={selected}
                className="flex-1"
                emptyText={`No messages with ${current.name} yet.`}
                placeholder={`Message ${current.name}`}
              />
            </>
          ) : selected && (threads.isLoading || contacts.isLoading) ? (
            <LoadingState />
          ) : (
            <div className="bg-white rounded-lg border flex-1 flex items-center justify-center">
              <EmptyState title="Choose a conversation" description="Or press + to message a caregiver or patient." />
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
};

export default AdminMessages;
