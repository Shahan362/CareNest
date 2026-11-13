import React from 'react';
import { addWeeks, endOfWeek, format, startOfWeek, subWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight, Info, Plus, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SchedulerFiltersProps {
  selectedWeek: Date;
  selectedRegion: string;
  regions: string[];
  searchTerm: string;
  caregiverCount: number;
  onWeekChange: (week: Date) => void;
  onRegionChange: (region: string) => void;
  onSearchChange: (search: string) => void;
  onRefresh: () => void;
  onAddVisit: () => void;
}

const SchedulerFilters: React.FC<SchedulerFiltersProps> = ({
  selectedWeek,
  selectedRegion,
  regions,
  searchTerm,
  caregiverCount,
  onWeekChange,
  onRegionChange,
  onSearchChange,
  onRefresh,
  onAddVisit,
}) => {
  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });
  const hasActiveFilters = selectedRegion !== 'all' || searchTerm !== '';

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4 mb-4">
      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => onWeekChange(subWeeks(selectedWeek, 1))} aria-label="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-medium whitespace-nowrap">
            {format(weekStart, 'd MMM')} - {format(weekEnd, 'd MMM yyyy')}
          </span>
          <Button variant="outline" size="sm" onClick={() => onWeekChange(addWeeks(selectedWeek, 1))} aria-label="Next week">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onWeekChange(new Date())}>
            This week
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={onAddVisit}>
            <Plus className="w-4 h-4 mr-2" />
            Schedule Visit
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search caregivers by name or specialty..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedRegion} onValueChange={onRegionChange}>
          <SelectTrigger className="md:w-44">
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All regions</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => { onRegionChange('all'); onSearchChange(''); }}>
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground flex-wrap">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>Click + to add a visit. Drag a visit to another day or caregiver to move it (its time stays the same).</span>
        </div>
        <Badge variant="secondary">{caregiverCount} caregivers</Badge>
      </div>
    </div>
  );
};

export default SchedulerFilters;
