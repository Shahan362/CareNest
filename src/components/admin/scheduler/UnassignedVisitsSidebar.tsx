import React from 'react';
import { addHours } from 'date-fns';
import { AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VisitView } from '@/hooks/useAdminViews';
import { formatDate, formatTime } from '@/lib/format';
import { durationLabel } from '@/lib/visits';
import { VISIT_DRAG_TYPE } from './WeekGrid';

interface UnassignedVisitsSidebarProps {
  visits: VisitView[];
  onVisitSelect: (visit: VisitView) => void;
  onAddVisit: () => void;
}

const VisitChip: React.FC<{ visit: VisitView; onClick: () => void }> = ({ visit, onClick }) => (
  <button
    type="button"
    draggable
    onDragStart={(e) => e.dataTransfer.setData(VISIT_DRAG_TYPE, visit.row.id)}
    onClick={onClick}
    className="w-full text-left p-2 rounded border bg-orange-50 border-orange-200 text-orange-900 text-xs hover:shadow-md cursor-grab active:cursor-grabbing"
  >
    <div className="font-medium truncate">{visit.patientName}</div>
    <div className="text-orange-800/80">
      {formatDate(visit.start)} {formatTime(visit.start)} · {durationLabel(visit.minutes)}
    </div>
    {visit.row.tasks.length > 0 && <div className="truncate mt-0.5">{visit.row.tasks.join(', ')}</div>}
  </button>
);

/** Upcoming visits with no caregiver. Drag one onto the grid, or click it for suggestions. */
const UnassignedVisitsSidebar: React.FC<UnassignedVisitsSidebarProps> = ({ visits, onVisitSelect, onAddVisit }) => {
  const soon = addHours(new Date(), 48);
  const urgent = visits.filter((v) => v.start <= soon);
  const later = visits.filter((v) => v.start > soon);

  return (
    <div className="w-full lg:w-72 bg-white rounded-lg border flex flex-col lg:max-h-[calc(100vh-180px)]">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Unassigned Visits</h3>
          <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">{visits.length}</span>
        </div>
        <Button onClick={onAddVisit} className="w-full" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Unassigned Visit
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {urgent.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <h4 className="font-medium text-sm text-red-700">Next 48 hours</h4>
            </div>
            <div className="space-y-2">
              {urgent.map((v) => <VisitChip key={v.row.id} visit={v} onClick={() => onVisitSelect(v)} />)}
            </div>
          </div>
        )}
        {later.length > 0 && (
          <div>
            <h4 className="font-medium text-sm mb-2">Later</h4>
            <div className="space-y-2">
              {later.map((v) => <VisitChip key={v.row.id} visit={v} onClick={() => onVisitSelect(v)} />)}
            </div>
          </div>
        )}
        {visits.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <p>No unassigned visits</p>
            <p className="text-xs mt-1">Every upcoming visit has a caregiver.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnassignedVisitsSidebar;
