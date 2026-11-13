import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import CaregiverFormDialog from '@/components/admin/CaregiverFormDialog';
import CaregiverDetailsDialog from '@/components/admin/CaregiverDetailsDialog';
import PatientDetailsDialog from '@/components/admin/PatientDetailsDialog';
import CaregiverTable from '@/components/admin/CaregiverTable';
import CaregiverWorkloadView from '@/components/admin/CaregiverWorkloadView';
import CaregiverFilters from '@/components/admin/CaregiverFilters';
import WorkloadSummaryStats from '@/components/admin/WorkloadSummaryStats';
import WorkloadActions from '@/components/admin/WorkloadActions';
import WorkloadInsights from '@/components/admin/WorkloadInsights';
import CaregiverUtilizationHeatmap from '@/components/admin/CaregiverUtilizationHeatmap';
import HeatmapFilters from '@/components/admin/HeatmapFilters';
import CaregiverTabsHeader from '@/components/admin/CaregiverTabsHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useAdminCaregivers } from '@/hooks/useAdminViews';
import { usePatientRows } from '@/hooks/data/useAgencyData';
import { useCaregiverManagement } from '@/hooks/useCaregiverManagement';
import { useCaregiverFilters } from '@/hooks/useCaregiverFilters';

type View = 'list' | 'workload' | 'heatmap';

const AdminCaregivers: React.FC = () => {
  const [activeView, setActiveView] = useState<View>('list');
  const { caregivers, regions, isLoading, error, refetch } = useAdminCaregivers();
  const { data: patients = [] } = usePatientRows();

  const m = useCaregiverManagement(caregivers, patients);
  const f = useCaregiverFilters();

  const filteredCaregivers = f.filterCaregivers(caregivers.map((c) => c.view), activeView);
  const activeCaregivers = filteredCaregivers.filter((c) => c.status === 'Active');
  const hasOverloadedStaff = activeCaregivers.some((c) => c.maxHours > 0 && c.assignedHours / c.maxHours >= 0.95);
  const hasUnderutilizedStaff = activeCaregivers.some((c) => c.maxHours > 0 && c.assignedHours / c.maxHours < 0.6);

  const content = (children: React.ReactNode) => {
    if (isLoading) return <div className="bg-white rounded-lg border p-4"><LoadingState label="Loading caregivers..." /></div>;
    if (error) return <div className="bg-white rounded-lg border p-4"><ErrorState error={error} onRetry={refetch} /></div>;
    if (caregivers.length === 0) {
      return (
        <div className="bg-white rounded-lg border p-4">
          <EmptyState
            title="No caregivers yet"
            description="Add your first caregiver, or share your agency code so caregivers can sign up themselves."
            action={<Button onClick={m.handleAddCaregiver}><Plus className="h-4 w-4 mr-2" />Add Caregiver</Button>}
          />
        </div>
      );
    }
    return children;
  };

  return (
    <Layout title="Caregivers" role="admin">
      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as View)} className="w-full">
        <CaregiverTabsHeader
          searchTerm={f.searchTerm}
          onSearchChange={f.setSearchTerm}
          onAddCaregiver={m.handleAddCaregiver}
        />

        <TabsContent value="list">
          {content(
            filteredCaregivers.length === 0 ? (
              <div className="bg-white rounded-lg border p-4"><EmptyState title="No caregivers match your search" /></div>
            ) : (
              <CaregiverTable
                caregivers={filteredCaregivers}
                onCaregiverClick={m.handleCaregiverClick}
                onEditCaregiver={m.handleEditCaregiver}
                onPatientClick={m.handlePatientClick}
              />
            ),
          )}
        </TabsContent>

        <TabsContent value="workload" className="space-y-6">
          {content(
            <>
              <WorkloadSummaryStats caregivers={filteredCaregivers} />
              <WorkloadActions
                caregivers={filteredCaregivers}
                onRefresh={refetch}
                hasOverloadedStaff={hasOverloadedStaff}
                hasUnderutilizedStaff={hasUnderutilizedStaff}
              />
              <WorkloadInsights caregivers={filteredCaregivers} />
              <CaregiverFilters region={f.region} regions={regions} onRegionChange={f.setRegion} />
              <CaregiverWorkloadView caregivers={filteredCaregivers} />
            </>,
          )}
        </TabsContent>

        <TabsContent value="heatmap" className="space-y-6">
          {content(
            <>
              <HeatmapFilters
                weekStartDate={f.heatmapWeekStart}
                region={f.region}
                showOverbookedOnly={f.showOverbookedOnly}
                regions={regions}
                onWeekChange={f.setHeatmapWeekStart}
                onRegionChange={f.setRegion}
                onShowOverbookedToggle={f.setShowOverbookedOnly}
              />
              <CaregiverUtilizationHeatmap caregivers={filteredCaregivers} weekStartDate={f.heatmapWeekStart} />
            </>,
          )}
        </TabsContent>
      </Tabs>

      <CaregiverFormDialog open={m.isFormOpen} onOpenChange={m.setIsFormOpen} caregiver={m.editingCaregiver} />
      <CaregiverDetailsDialog
        open={m.isDetailsCaregiverOpen}
        onOpenChange={m.setIsDetailsCaregiverOpen}
        caregiver={m.selectedCaregiver}
      />
      <PatientDetailsDialog
        open={m.isPatientDetailsOpen}
        onOpenChange={m.setIsPatientDetailsOpen}
        patient={m.selectedPatient}
      />
    </Layout>
  );
};

export default AdminCaregivers;
