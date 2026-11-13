import React, { useMemo, useState } from 'react';
import { endOfWeek, parseISO, startOfWeek } from 'date-fns';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import SchedulerFilters from '@/components/admin/scheduler/SchedulerFilters';
import WeekGrid from '@/components/admin/scheduler/WeekGrid';
import UnassignedVisitsSidebar from '@/components/admin/scheduler/UnassignedVisitsSidebar';
import CaregiverSuggestionsModal from '@/components/admin/scheduler/CaregiverSuggestionsModal';
import VisitFormDialog, { type VisitDefaults } from '@/components/admin/VisitFormDialog';
import VisitDetailsDialog from '@/components/admin/VisitDetailsDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { Button } from '@/components/ui/button';
import { useAdminVisits, type VisitView } from '@/hooks/useAdminViews';
import { useSaveVisit, useUnassignedVisits } from '@/hooks/data/useAgencyData';
import { formatTime, fullName } from '@/lib/format';
import { findConflicts, toDateInput } from '@/lib/visits';

const AdminScheduler: React.FC = () => {
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VisitView | null>(null);
  const [defaults, setDefaults] = useState<VisitDefaults | undefined>();
  const [details, setDetails] = useState<VisitView | null>(null);
  const [suggestFor, setSuggestFor] = useState<VisitView | null>(null);

  const range = useMemo(
    () => ({
      from: startOfWeek(selectedWeek, { weekStartsOn: 1 }).toISOString(),
      to: endOfWeek(selectedWeek, { weekStartsOn: 1 }).toISOString(),
    }),
    [selectedWeek],
  );
  const { visits, patients, caregivers, isLoading, error, refetch } = useAdminVisits(range.from, range.to);
  const unassignedQuery = useUnassignedVisits();
  const save = useSaveVisit();

  // Unassigned visits get names the same way as week visits.
  const unassigned = useMemo<VisitView[]>(() => {
    const pById = new Map(patients.map((p) => [p.id, p]));
    return (unassignedQuery.data ?? []).map((v) => {
      const start = parseISO(v.start_time);
      const end = parseISO(v.end_time);
      return {
        row: v,
        start,
        end,
        minutes: Math.round((end.getTime() - start.getTime()) / 60000),
        patientName: fullName(pById.get(v.patient_id)) || 'Unknown patient',
        caregiverName: null,
      };
    });
  }, [unassignedQuery.data, patients]);

  const regions = useMemo(
    () => Array.from(new Set(caregivers.map((c) => c.region).filter((r): r is string => !!r))).sort(),
    [caregivers],
  );

  const term = searchTerm.trim().toLowerCase();
  const shownCaregivers = caregivers.filter((c) => {
    const hasVisitsThisWeek = visits.some((v) => v.row.caregiver_id === c.id);
    if (c.status !== 'active' && !hasVisitsThisWeek) return false;
    if (selectedRegion !== 'all' && c.region !== selectedRegion) return false;
    if (!term) return true;
    return fullName(c).toLowerCase().includes(term) || (c.specialty ?? '').toLowerCase().includes(term);
  });

  const openCreate = (d?: VisitDefaults) => {
    setEditing(null);
    setDefaults(d);
    setFormOpen(true);
  };

  const openEdit = (v: VisitView) => {
    setDetails(null);
    setEditing(v);
    setFormOpen(true);
  };

  /** Move a visit to another caregiver/day, keeping its time of day and length. */
  const handleDrop = async (visitId: string, caregiverId: string, day: Date) => {
    const v = visits.find((x) => x.row.id === visitId) ?? unassigned.find((x) => x.row.id === visitId);
    if (!v) return;
    const start = new Date(day);
    start.setHours(v.start.getHours(), v.start.getMinutes(), 0, 0);
    const end = new Date(start.getTime() + v.minutes * 60000);
    if (v.row.caregiver_id === caregiverId && start.getTime() === v.start.getTime()) return;

    try {
      await save.mutateAsync({
        id: visitId,
        input: { caregiver_id: caregiverId, start_time: start.toISOString(), end_time: end.toISOString() },
      });
      const name = fullName(caregivers.find((c) => c.id === caregiverId));
      const clashes = findConflicts(visits.map((x) => x.row), caregiverId, start, end, visitId);
      if (clashes.length > 0) {
        toast.warning(`Moved to ${name}, but it overlaps another visit at ${formatTime(clashes[0].start_time)}.`);
      } else {
        toast.success(`Visit moved to ${name}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const renderGrid = () => {
    if (isLoading) return <div className="bg-white rounded-lg border"><LoadingState label="Loading schedule..." /></div>;
    if (error) return <div className="bg-white rounded-lg border"><ErrorState error={error} onRetry={refetch} /></div>;
    if (caregivers.length === 0) {
      return (
        <div className="bg-white rounded-lg border">
          <EmptyState
            title="No caregivers yet"
            description="Add caregivers first. You can still create unassigned visits with the button on the right."
            action={<Button asChild variant="outline"><Link to="/admin/caregivers">Go to Caregivers</Link></Button>}
          />
        </div>
      );
    }
    if (shownCaregivers.length === 0) {
      return <div className="bg-white rounded-lg border"><EmptyState title="No caregivers match your filters" /></div>;
    }
    return (
      <WeekGrid
        caregivers={shownCaregivers}
        visits={visits}
        selectedWeek={selectedWeek}
        onAddVisit={(caregiverId, date) => openCreate({ caregiverId, date: toDateInput(date) })}
        onVisitClick={setDetails}
        onVisitDrop={handleDrop}
      />
    );
  };

  return (
    <Layout title="Scheduler" role="admin">
      <SchedulerFilters
        selectedWeek={selectedWeek}
        selectedRegion={selectedRegion}
        regions={regions}
        searchTerm={searchTerm}
        caregiverCount={shownCaregivers.length}
        onWeekChange={setSelectedWeek}
        onRegionChange={setSelectedRegion}
        onSearchChange={setSearchTerm}
        onRefresh={() => {
          refetch();
          unassignedQuery.refetch();
        }}
        onAddVisit={() => openCreate()}
      />

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">{renderGrid()}</div>
        <UnassignedVisitsSidebar visits={unassigned} onVisitSelect={setSuggestFor} onAddVisit={() => openCreate()} />
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

export default AdminScheduler;
