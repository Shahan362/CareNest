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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useDeleteCaregiver, useSaveCaregiver } from '@/hooks/data/useAgencyData';
import type { CaregiverRow } from '@/lib/database.types';
import { fullName } from '@/lib/format';

const schema = z.object({
  first_name: z.string().trim().min(1, 'First name is required.'),
  last_name: z.string().trim().min(1, 'Last name is required.'),
  email: z.union([z.literal(''), z.string().trim().email('Please enter a valid email address.')]),
  phone: z.string().trim().min(7, 'Please enter a valid phone number.'),
  specialty: z.string().trim(),
  region: z.string().trim(),
  availability: z.enum(['full-time', 'part-time', 'contract']),
  max_hours_per_week: z.coerce.number().min(0, 'Cannot be negative.').max(80, 'Maximum is 80 hours.'),
  start_date: z.string(),
  status: z.enum(['active', 'inactive']),
});

type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  specialty: '',
  region: '',
  availability: 'full-time',
  max_hours_per_week: 40,
  start_date: '',
  status: 'active',
};

const DEFAULT_HOURS: Record<FormValues['availability'], number> = {
  'full-time': 40,
  'part-time': 20,
  contract: 30,
};

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface CaregiverFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a caregiver to edit; leave empty to add a new one. */
  caregiver?: CaregiverRow | null;
}

const CaregiverFormDialog: React.FC<CaregiverFormDialogProps> = ({ open, onOpenChange, caregiver }) => {
  const isEdit = !!caregiver;
  const save = useSaveCaregiver();
  const remove = useDeleteCaregiver();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues });

  useEffect(() => {
    if (!open) return;
    form.reset(
      caregiver
        ? {
            first_name: caregiver.first_name,
            last_name: caregiver.last_name,
            email: caregiver.email ?? '',
            phone: caregiver.phone ?? '',
            specialty: caregiver.specialty ?? '',
            region: caregiver.region ?? '',
            availability: caregiver.availability,
            max_hours_per_week: Number(caregiver.max_hours_per_week),
            start_date: caregiver.start_date ?? '',
            status: caregiver.status,
          }
        : emptyValues,
    );
  }, [open, caregiver, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      await save.mutateAsync({ id: caregiver?.id, input: values });
      toast.success(isEdit ? 'Caregiver updated' : 'Caregiver added');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onDelete = async () => {
    if (!caregiver) return;
    try {
      await remove.mutateAsync(caregiver.id);
      toast.success('Caregiver deleted');
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const c = form.control;
  const text = (name: keyof FormValues, label: string, type = 'text', placeholder?: string) => (
    <FormField
      control={c}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} placeholder={placeholder} {...field} value={field.value as string | number} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit Caregiver' : 'Add New Caregiver'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-2" noValidate>
              <div className="grid grid-cols-2 gap-4">
                {text('first_name', 'First Name')}
                {text('last_name', 'Last Name')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {text('email', 'Email', 'email')}
                {text('phone', 'Phone', 'tel')}
              </div>
              {!isEdit && (
                <p className="text-xs text-muted-foreground -mt-2">
                  If this caregiver later signs up with the same email and your agency code, their account is linked to this record.
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                {text('specialty', 'Specialty', 'text', 'e.g. Dementia care')}
                {text('region', 'Region / Area', 'text', 'e.g. North London')}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={c}
                  name="availability"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Availability</FormLabel>
                      <FormControl>
                        <select
                          className={selectClass}
                          {...field}
                          onChange={(e) => {
                            const value = e.target.value as FormValues['availability'];
                            field.onChange(value);
                            // Suggest typical hours when adding a new caregiver.
                            if (!isEdit) form.setValue('max_hours_per_week', DEFAULT_HOURS[value]);
                          }}
                        >
                          <option value="full-time">Full-time</option>
                          <option value="part-time">Part-time</option>
                          <option value="contract">Contract</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {text('max_hours_per_week', 'Max Hours / Week', 'number')}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {text('start_date', 'Start Date', 'date')}
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
                    {save.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Caregiver'}
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
            <AlertDialogTitle>Delete {caregiver ? fullName(caregiver) : 'caregiver'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their visits will become unassigned and patients will lose them as primary caregiver. This cannot be undone. To keep their history, set the status to Inactive instead.
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

export default CaregiverFormDialog;
