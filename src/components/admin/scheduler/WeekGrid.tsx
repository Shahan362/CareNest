import React, { useState } from 'react';
import { addDays, format, isSameDay, isToday, startOfWeek } from 'date-fns';
import { Plus } from 'lucide-react';
import type { CaregiverRow } from '@/lib/database.types';
import type { VisitView } from '@/hooks/useAdminViews';
import { formatTime, fullName, initials } from '@/lib/format';
import { STATUS_STYLE, isActiveVisit } from '@/lib/visits';
import { cn } from '@/lib/utils';

export const VISIT_DRAG_TYPE = 'application/x-carenest-visit';

interface WeekGridProps {
  caregivers: CaregiverRow[];
  visits: VisitView[];
  selectedWeek: Date;
  onAddVisit: (caregiverId: string, date: Date) => void;
  onVisitClick: (visit: VisitView) => void;
  /** A visit was dropped on a caregiver's day. */
  onVisitDrop: (visitId: string, caregiverId: string, date: Date) => void;
}

const WeekGrid: React.FC<WeekGridProps> = ({ caregivers, visits, selectedWeek, onAddVisit, onVisitClick, onVisitDrop }) => {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const hoursFor = (caregiverId: string) =>
    Math.round(
      (visits
        .filter((v) => v.row.caregiver_id === caregiverId && isActiveVisit(v.row))
        .reduce((t, v) => t + v.minutes, 0) /
        60) *
        10,
    ) / 10;

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[200px_repeat(7,1fr)] border-b bg-muted/30">
            <div className="p-3 text-sm font-semibold border-r">Caregiver</div>
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className={cn('p-2 text-center border-r last:border-r-0', isToday(day) && 'bg-primary/10')}
              >
                <div className="text-sm font-semibold">{format(day, 'EEE')}</div>
                <div className="text-xs text-muted-foreground">{format(day, 'd MMM')}</div>
              </div>
            ))}
          </div>

          {caregivers.map((cg) => {
            const hours = hoursFor(cg.id);
            const max = Number(cg.max_hours_per_week);
            const over = max > 0 && hours > max;
            return (
              <div key={cg.id} className="grid grid-cols-[200px_repeat(7,1fr)] border-b last:border-b-0">
                <div className="p-3 border-r bg-muted/10 flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
                    {initials(cg)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate" title={fullName(cg)}>{fullName(cg)}</div>
                    {cg.specialty && <div className="text-xs text-muted-foreground truncate">{cg.specialty}</div>}
                    <div className={cn('text-xs', over ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                      {hours}/{max}h this week
                    </div>
                  </div>
                </div>

                {days.map((day) => {
                  const cellId = `${cg.id}-${day.toISOString()}`;
                  const dayVisits = visits
                    .filter((v) => v.row.caregiver_id === cg.id && isSameDay(v.start, day))
                    .sort((a, b) => a.start.getTime() - b.start.getTime());
                  return (
                    <div
                      key={cellId}
                      className={cn(
                        'group relative min-h-[96px] border-r last:border-r-0 p-1 space-y-1 transition-colors',
                        isToday(day) && 'bg-primary/5',
                        dragOver === cellId && 'bg-primary/20 ring-2 ring-inset ring-primary/50',
                      )}
                      onDragOver={(e) => {
                        if (!e.dataTransfer.types.includes(VISIT_DRAG_TYPE)) return;
                        e.preventDefault();
                        setDragOver(cellId);
                      }}
                      onDragLeave={() => setDragOver((cur) => (cur === cellId ? null : cur))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(null);
                        const visitId = e.dataTransfer.getData(VISIT_DRAG_TYPE);
                        if (visitId) onVisitDrop(visitId, cg.id, day);
                      }}
                    >
                      {dayVisits.map((v) => (
                        <button
                          key={v.row.id}
                          type="button"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData(VISIT_DRAG_TYPE, v.row.id)}
                          onClick={() => onVisitClick(v)}
                          className={cn(
                            'w-full text-left rounded border px-1.5 py-1 text-xs hover:shadow-sm cursor-grab active:cursor-grabbing',
                            STATUS_STYLE[v.row.status],
                          )}
                          title={`${v.patientName}, ${formatTime(v.start)}-${formatTime(v.end)}`}
                        >
                          <div className="font-semibold">{formatTime(v.start)}-{formatTime(v.end)}</div>
                          <div className="truncate">{v.patientName}</div>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => onAddVisit(cg.id, day)}
                        className={cn(
                          'w-full rounded border border-dashed border-transparent text-muted-foreground text-xs py-1 flex items-center justify-center gap-1',
                          'hover:border-primary/40 hover:text-primary',
                          dayVisits.length > 0 ? 'opacity-0 group-hover:opacity-100 focus:opacity-100' : 'opacity-60',
                        )}
                        aria-label={`Add visit for ${fullName(cg)} on ${format(day, 'd MMM')}`}
                      >
                        <Plus className="h-3 w-3" />
                        <span className="hidden xl:inline">Add</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default WeekGrid;
