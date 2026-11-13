import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState, LoadingState } from '@/components/admin/DataState';
import { useAuth } from '@/contexts/AuthContext';
import { useMarkThreadRead, useSendMessage, useThread } from '@/hooks/data/useMessages';
import type { MessageRow } from '@/lib/database.types';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ChatThreadProps {
  /** The caregiver / patient whose conversation with the office this is. */
  threadUserId: string;
  /** Shown when there are no messages yet. */
  emptyText: string;
  placeholder?: string;
  className?: string;
}

const dayLabel = (iso: string) => {
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE d MMMM yyyy');
};

/** A conversation with the office: message bubbles, read receipts and a reply box. */
const ChatThread: React.FC<ChatThreadProps> = ({ threadUserId, emptyText, placeholder = 'Write a message', className }) => {
  const { user, profile } = useAuth();
  const isOffice = profile?.role === 'admin';
  const { data: messages = [], isLoading, error, refetch } = useThread(threadUserId);
  const send = useSendMessage();
  const markRead = useMarkThreadRead();
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  // Messages from the other side that this user hasn't read yet.
  const unreadFromOther = messages.some((m) => !m.read_at && m.from_office !== isOffice);
  const { mutate: markThreadRead } = markRead;
  useEffect(() => {
    if (unreadFromOther) markThreadRead(threadUserId);
  }, [unreadFromOther, threadUserId, markThreadRead]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, threadUserId]);

  const groups = useMemo(() => {
    const out: { day: string; items: MessageRow[] }[] = [];
    for (const m of messages) {
      const day = dayLabel(m.created_at);
      if (out.length === 0 || out[out.length - 1].day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(m);
    }
    return out;
  }, [messages]);

  const lastMine = [...messages].reverse().find((m) => m.from_office === isOffice);

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    try {
      await send.mutateAsync({ threadUserId, body });
      setText('');
    } catch (e) {
      // Keep the text so nothing is lost.
      toast.error((e as Error).message);
    }
  };

  return (
    <div className={cn('flex flex-col bg-white rounded-lg border min-h-0', className)}>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 min-h-[300px]">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12 max-w-sm mx-auto">{emptyText}</p>
        ) : (
          groups.map((g) => (
            <div key={g.day} className="space-y-2">
              <p className="text-center text-xs text-gray-500">{g.day}</p>
              {g.items.map((m) => {
                const mine = m.sender_id === user?.id;
                const sameSide = m.from_office === isOffice;
                return (
                  <div key={m.id} className={cn('flex flex-col', sameSide ? 'items-end' : 'items-start')}>
                    {(!mine || isOffice) && (
                      <span className="text-xs text-gray-500 mb-0.5 px-1">
                        {mine ? 'You' : m.sender_name}
                        {m.from_office && !isOffice && ' · Office'}
                      </span>
                    )}
                    <div
                      className={cn(
                        'max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
                        sameSide ? 'bg-primary text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm',
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="text-[11px] text-gray-400 mt-0.5 px-1">
                      {formatTime(m.created_at)}
                      {m.id === lastMine?.id && sameSide && (m.read_at ? ' · Seen' : ' · Sent')}
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>

      <form
        className="border-t p-2 sm:p-3 flex gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          rows={2}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="resize-none"
        />
        <Button type="submit" size="icon" aria-label="Send" disabled={send.isPending || !text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
};

export default ChatThread;
