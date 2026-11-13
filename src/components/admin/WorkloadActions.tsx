import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw, Users, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface WorkloadRow {
  name: string;
  specialty: string;
  region: string;
  status: string;
  assignedHours: number;
  maxHours: number;
  visits: number;
  patients: number;
}

interface WorkloadActionsProps {
  caregivers: WorkloadRow[];
  onRefresh: () => void;
  hasOverloadedStaff: boolean;
  hasUnderutilizedStaff: boolean;
}

const WorkloadActions: React.FC<WorkloadActionsProps> = ({
  caregivers,
  onRefresh,
  hasOverloadedStaff,
  hasUnderutilizedStaff,
}) => {
  const navigate = useNavigate();

  const handleExportReport = () => {
    const header = ['Name', 'Specialty', 'Region', 'Status', 'Assigned Hours', 'Max Hours', 'Utilisation %', 'Visits', 'Patients'];
    const rows = caregivers.map((c) => [
      c.name,
      c.specialty,
      c.region,
      c.status,
      c.assignedHours,
      c.maxHours,
      c.maxHours ? Math.round((c.assignedHours / c.maxHours) * 100) : 0,
      c.visits,
      c.patients,
    ]);
    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `workload-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col md:flex-row gap-3 mb-6">
      <div className="flex gap-2">
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Data
        </Button>

        <Button variant="outline" onClick={handleExportReport} disabled={caregivers.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="flex gap-2">
        <Button variant="default" onClick={() => navigate('/admin/calendar')}>
          <Calendar className="h-4 w-4 mr-2" />
          View Schedule
        </Button>

        {(hasOverloadedStaff || hasUnderutilizedStaff) && (
          <Button variant="secondary" onClick={() => navigate('/admin/scheduler')}>
            <Users className="h-4 w-4 mr-2" />
            Rebalance in Scheduler
          </Button>
        )}
      </div>
    </div>
  );
};

export default WorkloadActions;
