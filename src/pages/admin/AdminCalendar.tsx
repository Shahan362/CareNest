import React, { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Clock, Pencil, Plus, Search } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import VisitFormDialog, { type VisitDefaults } from '@/components/admin/VisitFormDialog';
import VisitDetailsDialog from '@/components/admin/VisitDetailsDialog';
import CaregiverSuggestionsModal from '@/components/admin/scheduler/CaregiverSuggestionsModal';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { Button } from '@/components/ui/button';
import { useAdminVisits, type VisitView } from '@/hooks/useAdminViews';
import type { VisitStatus } from '@/lib/database.types';
import { formatTime, fullName } from '@/lib/format';
import { STATUS_LABEL, STATUS_STYLE, durationLabel, toDateInput } from '@/lib/visits';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
type StatusFilter = 'all' | 'unassigned' | VisitStatus;

const AdminCalendar: React.FC = () => {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [caregiverFilter, setCaregiverFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VisitView | null>(null);
  const [defaults, setDefaults] = useState<VisitDefaults | undefined>();
  const [details, setDetails] = useState<VisitView | null>(null);
  const [suggestFor, setSuggestFor] = useState<VisitView | null>(null);

  // The grid shows whole weeks (Monday first), so it includes a few days from the months either side.
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) out.push(d);
    return out;
  }, [gridStart.getTime(), gridEnd.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const { visits, caregivers, isLoading, error, refetch } = useAdminVisits(gridStart.toISOString(), gridEnd.toISOString());

  const term = search.trim().toLowerCase();
  const filtered = visits.filter((v) => {
    if (caregiverFilter !== 'all' && v.row.caregiver_id !== caregiverFilter) return false;
    if (statusFilter === 'unassigned' && v.row.caregiver_id) return false;
    if (statusFilter !== 'all' && statusFilter !== 'unassigned' && v.row.status !== statusFilter) return false;
    if (!term) return true;
    return v.patientName.toLowerCase().includes(term) || (v.caregiverName ?? '').toLowerCase().includes(term);
  });

  const visitsOn = (day: Date) =>
    filtered.filter((v) => isSameDay(v.start, day)).sort((a, b) => a.start.getTime() - b.start.getTime());
  const selectedVisits = visitsOn(selectedDay);

  const openCreate = (date: Date) => {
    setEditing(null);
    setDefaults({ date: toDateInput(date) });
    setFormOpen(true);
  };

  const openEdit = (v: VisitView) => {
    setDetails(null);
    setEditing(v);
    setFormOpen(true);
  };

  const goToMonth = (m: Date) => {
    setMonth(startOfMonth(m));
    setSelectedDay(isSameMonth(m, new Date()) ? new Date() : startOfMonth(m));
  };

  return (
    <Layout title="Calendar" role="admin">
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="flex-grow relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Search by patient or caregiver name..."
            className="pl-10 pr-4 py-2 w-full border border-gray-200 rounded-lg"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 bg-white"
          value={caregiverFilter}
          onChange={(e) => setCaregiverFilter(e.target.value)}
          aria-label="Filter by caregiver"
        >
          <option value="all">All caregivers</option>
          {caregivers.map((c) => (
            <option key={c.id} value={c.id}>{fullName(c)}</option>
          ))}
        </select>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 bg-white"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="unassigned">Unassigned</option>
          {(Object.keys(STATUS_LABEL) as VisitStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <Button onClick={() => openCreate(selectedDay)} className="whitespace-nowrap">
          <Plus className="h-4 w-4 mr-2" />
          New Visit
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{format(month, 'MMMM yyyy')}</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => goToMonth(new Date())}>Today</Button>
            <button className="p-2 rounded-full hover:bg-gray-100" onClick={() => goToMonth(subMonths(month, 1))} aria-label="Previous month">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button className="p-2 rounded-full hover:bg-gray-100" onClick={() => goToMonth(addMonths(month, 1))} aria-label="Next month">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-xs sm:text-sm font-medium text-gray-500">{d}</div>
              ))}
            </div>
            <div className={cn('grid grid-cols-7 gap-1 sm:gap-2', isLoading && 'opacity-50')}>
              {days.map((day) => {
                const dayVisits = visitsOn(day);
                const inMonth = isSameMonth(day, month);
                const selected = isSameDay(day, selectedDay);
                return (
                  <button
                    type="button"
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(day)}
                    onDoubleClick={() => openCreate(day)}
                    className={cn(
                      'min-h-[56px] sm:min-h-[96px] p-1 rounded-lg border text-left align-top flex flex-col',
                      inMonth ? 'bg-white' : 'bg-gray-50',
                      selected ? 'border-primary ring-1 ring-primary' : 'border-gray-100 hover:border-gray-300',
                    )}
                  >
                    <div
                      className={cn(
                        'text-right text-xs sm:text-sm w-full',
                        inMonth ? 'font-medium' : 'text-gray-400',
                        isToday(day) && 'text-primary font-bold',
                      )}
                    >
                      {format(day, 'd')}
                    </div>
                    {/* Phones: a count. Larger screens: the first visits. */}
                    {dayVisits.length > 0 && (
                      <>
                        <div className="sm:hidden mt-auto text-center">
                          <span className="inline-block min-w-[20px] rounded-full bg-primary/15 text-primary text-[10px] px-1">
                            {dayVisits.length}
                          </span>
                        </div>
                        <div className="hidden sm:block mt-1 space-y-1 w-full">
                          {dayVisits.slice(0, 3).map((v) => (
                            <div
                              key={v.row.id}
                              className={cn('px-1 py-0.5 rounded text-[11px] truncate border', STATUS_STYLE[v.row.status], !v.row.caregiver_id && 'border-orange-300 bg-orange-50 text-orange-900')}
                            >
                              {formatTime(v.start)} {v.patientName}
                            </div>
                          ))}
                          {dayVisits.length > 3 && (
                            <div className="text-[11px] text-gray-500 text-center">+{dayVisits.length - 3} more</div>
                          )}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Click a day to see its visits. Double-click a day to schedule a visit on it.</p>
          </>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">
            {isToday(selectedDay) ? "Today's Schedule" : format(selectedDay, 'EEEE d MMMM')}
          </h2>
          <Button variant="outline" size="sm" onClick={() => openCreate(selectedDay)}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : selectedVisits.length === 0 ? (
          <EmptyState title="No visits on this day" />
        ) : (
          <div className="space-y-3">
            {selectedVisits.map((v) => (
              <div
                key={v.row.id}
                className="flex items-start p-3 sm:p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                onClick={() => setDetails(v)}
              >
                <div className="flex-shrink-0 mr-3 sm:mr-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                </div>
                <div className="flex-grow min-w-0">
                  <div className="flex justify-between gap-2">
                    <h3 className="font-medium">
                      {formatTime(v.start)}-{formatTime(v.end)} <span className="text-gray-500 font-normal">({durationLabel(v.minutes)})</span>
                    </h3>
                    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border h-fit whitespace-nowrap', STATUS_STYLE[v.row.status])}>
                      {STATUS_LABEL[v.row.status]}
                    </span>
                  </div>
                  <p className="font-medium">{v.patientName}</p>
                  <p className="text-sm text-gray-600">
                    Caregiver: {v.caregiverName ?? <span className="text-orange-700 font-medium">Unassigned</span>}
                  </p>
                  {v.row.tasks.length > 0 && <p className="text-xs text-gray-500 mt-1 truncate">{v.row.tasks.join(', ')}</p>}
                </div>
                <button
                  className="flex-shrink-0 ml-2 p-1 text-gray-600 hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(v);
                  }}
                  aria-label="Edit visit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <VisitFormDialog open={formOpen} onOpenChange={setFormOpen} visit={editing?.row} defaults={defaults} />
      <VisitDetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        visit={details}
        onEdit={openEdit}
        onFindCaregiver={(v) => {
          setDetails(null);
          setSuggestFor(v);
        }}
      />
      <CaregiverSuggestionsModal isOpen={!!suggestFor} onClose={() => setSuggestFor(null)} visit={suggestFor} />
    </Layout>
  );
};

export default AdminCalendar;
