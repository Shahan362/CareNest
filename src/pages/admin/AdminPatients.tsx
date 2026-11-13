import React, { useState } from 'react';
import { Pencil, Plus, Search, User } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import PatientFormDialog from '@/components/admin/PatientFormDialog';
import PatientDetailsDialog from '@/components/admin/PatientDetailsDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { Button } from '@/components/ui/button';
import { useAdminPatients } from '@/hooks/useAdminViews';
import type { PatientRow } from '@/lib/database.types';
import type { PatientForDialog } from '@/types/admin';

type StatusFilter = 'all' | 'active' | 'inactive';

const AdminPatients: React.FC = () => {
  const { patients, isLoading, error } = useAdminPatients();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PatientRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<PatientForDialog | null>(null);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (row: PatientRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(row);
    setFormOpen(true);
  };

  const openDetails = (view: PatientForDialog) => {
    setSelected(view);
    setDetailsOpen(true);
  };

  const term = searchTerm.trim().toLowerCase();
  const filtered = patients.filter(({ row, view }) => {
    if (statusFilter !== 'all' && row.status !== statusFilter) return false;
    if (!term) return true;
    return [view.name, view.caregiver, row.postcode, row.phone, row.email]
      .some((v) => v?.toLowerCase().includes(term));
  });

  const renderBody = () => {
    if (isLoading) return <LoadingState label="Loading patients..." />;
    if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />;
    if (patients.length === 0) {
      return (
        <EmptyState
          title="No patients yet"
          description="Add your first patient, or share your agency code so patients can sign up themselves."
          action={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Patient</Button>}
        />
      );
    }
    if (filtered.length === 0) return <EmptyState title="No patients match your search" />;

    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 text-sm">
              <th className="text-left py-3 px-4">Name</th>
              <th className="text-left py-3 px-4">Age</th>
              <th className="text-left py-3 px-4">Care Plan</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="text-left py-3 px-4">Primary Caregiver</th>
              <th className="text-left py-3 px-4">Next Visit</th>
              <th className="text-right py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ row, view }) => (
              <tr
                key={row.id}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                onClick={() => openDetails(view)}
              >
                <td className="py-3 px-4">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent mr-3">
                      <User className="h-4 w-4" />
                    </div>
                    <span className="font-medium">{view.name}</span>
                  </div>
                </td>
                <td className="py-3 px-4">{view.age ?? '-'}</td>
                <td className="py-3 px-4">{view.carePlan}</td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      view.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {view.status}
                  </span>
                </td>
                <td className="py-3 px-4">{view.caregiver}</td>
                <td className="py-3 px-4">{view.nextVisit}</td>
                <td className="py-3 px-4 text-right">
                  <button
                    className="text-gray-600 hover:text-primary p-1"
                    onClick={(e) => openEdit(row, e)}
                    aria-label={`Edit ${view.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <Layout title="Patients" role="admin">
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-grow relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Search by name, caregiver, postcode..."
            className="pl-10 pr-4 py-2 w-full border border-gray-200 rounded-lg"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 bg-white"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Filter by status"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All patients</option>
        </select>
        <Button className="whitespace-nowrap" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Patient
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">{renderBody()}</div>

      <PatientFormDialog open={formOpen} onOpenChange={setFormOpen} patient={editing} />
      <PatientDetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} patient={selected} />
    </Layout>
  );
};

export default AdminPatients;
