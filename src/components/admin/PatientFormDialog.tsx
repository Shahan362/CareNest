import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useCaregiverRows, useDeletePatient, useSavePatient } from '@/hooks/data/useAgencyData';
import { useAgency } from '@/hooks/data/useBilling';
import type { PatientRow } from '@/lib/database.types';
import { fullName } from '@/lib/format';

const schema = z.object({
  first_name: z.string().trim().min(1, 'First name is required.'),
  last_name: z.string().trim().min(1, 'Last name is required.'),
  date_of_birth: z.string().min(1, 'Date of birth is required.'),
  email: z.union([z.literal(''), z.string().trim().email('Please enter a valid email address.')]),
  phone: z.string().trim().min(7, 'Please enter a valid phone number.'),
  address: z.string().trim().min(5, 'Please enter the full address.'),
  postcode: z.string().trim().max(10, 'Please enter a valid postcode.'),
  care_plan: z.enum(['basic', 'comprehensive', 'advanced']),
  primary_caregiver_id: z.string(),
  hourly_rate: z.coerce.number().min(0, 'Rate cannot be negative.'),
  status: z.enum(['active', 'inactive']),
  notes: z.string(),
  emergency_contact_name: z.string().trim(),
  emergency_contact_relation: z.string().trim(),
  emergency_contact_phone: z.union([z.literal(''), z.string().trim().regex(/^\+?[0-9\s()-]{7,20}$/, 'Please enter a valid phone number.')]),
  gp_practice: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  email: '',
  phone: '',
  address: '',
  postcode: '',
  care_plan: 'basic',
  primary_caregiver_id: '',
  hourly_rate: 0,
  status: 'active',
  notes: '',
  emergency_contact_name: '',
  emergency_contact_relation: '',
  emergency_contact_phone: '',
  gp_practice: '',
};

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface PatientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a patient to edit it; leave empty to add a new one. */
  patient?: PatientRow | null;
}

const PatientFormDialog: React.FC<PatientFormDialogProps> = ({ open, onOpenChange, patient }) => {
  const isEdit = !!patient;
  const { data: caregivers = [] } = useCaregiverRows();
  const save = useSavePatient();
  const remove = useDeletePatient();
  const { data: agency } = useAgency();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues });

  useEffect(() => {
    if (!open) return;
    form.reset(
      patient
        ? {
            first_name: patient.first_name,
            last_name: patient.last_name,
            date_of_birth: patient.date_of_birth ?? '',
            email: patient.email ?? '',
            phone: patient.phone ?? '',
            address: patient.address ?? '',
            postcode: patient.postcode ?? '',
            care_plan: patient.care_plan,
            primary_caregiver_id: patient.primary_caregiver_id ?? '',
            hourly_rate: Number(patient.hourly_rate),
            status: patient.status,
            notes: patient.notes ?? '',
            emergency_contact_name: patient.emergency_contact_name ?? '',
            emergency_contact_relation: patient.emergency_contact_relation ?? '',
            emergency_contact_phone: patient.emergency_contact_phone ?? '',
            gp_practice: patient.gp_practice ?? '',
          }
        : { ...emptyValues, hourly_rate: Number(agency?.default_hourly_rate ?? 0) },
    );
  }, [open, patient, form, agency?.default_hourly_rate]);

  const onSubmit = async (values: FormValues) => {
    try {
      await save.mutateAsync({
        id: patient?.id,
        input: { ...values, primary_caregiver_id: values.primary_caregiver_id || null },
      });
      toast.success(isEdit ? 'Patient updated' : 'Patient added');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onDelete = async () => {
    if (!patient) return;
    try {
      await remove.mutateAsync(patient.id);
      toast.success('Patient deleted');
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const c = form.control;
  const activeCaregivers = caregivers.filter(
    (cg) => cg.status === 'active' || cg.id === patient?.primary_caregiver_id,
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit Patient' : 'Add New Patient'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-2" noValidate>
              <div className="grid grid-cols-2 gap-4">
                <TextInput control={c} name="first_name" label="First Name" />
                <TextInput control={c} name="last_name" label="Last Name" />
              </div>
              <TextInput control={c} name="date_of_birth" label="Date of Birth" type="date" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput control={c} name="email" label="Email (optional)" type="email" />
                <TextInput control={c} name="phone" label="Phone" type="tel" />
              </div>
              <FormField
                control={c}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <TextInput control={c} name="postcode" label="Postcode" />
                <TextInput control={c} name="hourly_rate" label="Hourly Rate (£)" type="number" step="0.01" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={c}
                  name="care_plan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Care Plan</FormLabel>
                      <FormControl>
                        <select className={selectClass} {...field}>
                          <option value="basic">Basic</option>
                          <option value="comprehensive">Comprehensive</option>
                          <option value="advanced">Advanced</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={c}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <FormControl>
                        <select className={selectClass} {...field}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={c}
                name="primary_caregiver_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Caregiver</FormLabel>
                    <FormControl>
                      <select className={selectClass} {...field}>
                        <option value="">Not assigned</option>
                        {activeCaregivers.map((cg) => (
                          <option key={cg.id} value={cg.id}>
                            {fullName(cg)}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    {caregivers.length === 0 && (
                      <p className="text-xs text-muted-foreground">Add caregivers first to assign one.</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-sm font-medium">Emergency contact and GP <span className="font-normal text-muted-foreground">(carers can see these)</span></p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextInput control={c} name="emergency_contact_name" label="Next of kin / contact" />
                  <TextInput control={c} name="emergency_contact_relation" label="Relationship" />
                  <TextInput control={c} name="emergency_contact_phone" label="Their phone" type="tel" />
                  <TextInput control={c} name="gp_practice" label="GP practice" />
                </div>
              </div>
              <FormField
                control={c}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="Allergies, access instructions, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="gap-2 sm:justify-between">
                {isEdit ? (
                  <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
                    Delete
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Patient'}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {patient ? fullName(patient) : 'patient'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This also deletes all of this patient's visits. This cannot be undone. To keep their history, set the status to Inactive instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {remove.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

function TextInput({
  control,
  name,
  label,
  type = 'text',
  step,
}: {
  control: ReturnType<typeof useForm<FormValues>>['control'];
  name: keyof FormValues;
  label: string;
  type?: string;
  step?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} step={step} {...field} value={field.value as string | number} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export default PatientFormDialog;
