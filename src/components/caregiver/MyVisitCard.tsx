import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Clock, MapPin } from 'lucide-react';
import type { MyVisit } from '@/hooks/data/useCaregiverData';
import { formatTime } from '@/lib/format';
import { STATUS_LABEL, STATUS_STYLE, durationLabel, durationMinutes } from '@/lib/visits';
import { isLate } from '@/lib/caregiver';
import { cn } from '@/lib/utils';

/** One visit in the caregiver's lists. The whole card opens the visit page. */
const MyVisitCard: React.FC<{ visit: MyVisit; showDate?: string }> = ({ visit, showDate }) => {
  const { row, patient } = visit;
  const late = isLate(row);

  return (
    <Link
      to={`/caregiver/visits/${row.id}`}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-white p-3 hover:shadow-sm transition-shadow',
        row.status === 'in_progress' && 'border-yellow-300 bg-yellow-50',
        late && 'border-red-300',
        (row.status === 'cancelled' || row.status === 'missed') && 'opacity-60',
      )}
    >
      <div className="w-14 flex-shrink-0 text-center">
        <p className="font-semibold">{formatTime(visit.start)}</p>
        <p className="text-xs text-gray-500">{durationLabel(durationMinutes(row))}</p>
      </div>
      <div className="flex-1 min-w-0 border-l pl-3">
        {showDate && <p className="text-xs font-medium text-gray-500">{showDate}</p>}
        <p className="font-medium truncate">{visit.patientName}</p>
        {patient?.postcode && (
          <p className="text-xs text-gray-600 flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            {patient.postcode}
          </p>
        )}
        {row.tasks.length > 0 && <p className="text-xs text-gray-500 truncate">{row.tasks.join(', ')}</p>}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap', STATUS_STYLE[row.status])}>
          {STATUS_LABEL[row.status]}
        </span>
        {late && (
          <span className="flex items-center gap-1 text-xs font-medium text-red-700">
            <Clock className="h-3 w-3" /> Late
          </span>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
    </Link>
  );
};

export default MyVisitCard;
