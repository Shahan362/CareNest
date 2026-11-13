import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Building2, Copy, CreditCard, KeyRound, RefreshCw, User } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { ErrorState, LoadingState } from '@/components/admin/DataState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
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
import MyAccount from '@/components/account/MyAccount';
import { useAgency, useRegenerateAgencyCode, useSaveAgency } from '@/hooks/data/useBilling';
import { PAYMENT_TERMS } from '@/lib/billing';
import type { AgencyRow } from '@/lib/database.types';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const optional = (schema: z.ZodString) => z.union([z.literal(''), schema]);

// ---------- Agency details ----------

const agencySchema = z.object({
  name: z.string().trim().min(1, 'Agency name is required.'),
  registration_number: optional(z.string().trim().regex(/^[A-Za-z0-9]{6,10}$/, 'Companies House numbers are 8 characters, e.g. 12345678 or SC123456.')),
  cqc_provider_id: optional(z.string().trim().regex(/^1-\d{6,12}$/, 'CQC provider IDs look like 1-123456789.')),
  email: optional(z.string().trim().email('Please enter a valid email address.')),
  phone: optional(z.string().trim().regex(/^\+?[0-9\s()-]{7,20}$/, 'Please enter a valid phone number.')),
  address: z.string().trim(),
  postcode: optional(z.string().trim().regex(/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/, 'Please enter a valid UK postcode, e.g. SW1A 1AA.')),
});
type AgencyValues = z.infer<typeof agencySchema>;

const AgencyDetailsForm: React.FC<{ agency: AgencyRow }> = ({ agency }) => {
  const save = useSaveAgency();
  const form = useForm<AgencyValues>({ resolver: zodResolver(agencySchema) });

  useEffect(() => {
    form.reset({
      name: agency.name ?? '',
      registration_number: agency.registration_number ?? '',
      cqc_provider_id: agency.cqc_provider_id ?? '',
      email: agency.email ?? '',
      phone: agency.phone ?? '',
      address: agency.address ?? '',
      postcode: agency.postcode ?? '',
    });
  }, [agency, form]);

  const onSubmit = async (v: AgencyValues) => {
    try {
      await save.mutateAsync({ ...v, postcode: v.postcode.toUpperCase() });
      toast.success('Agency details saved');
      form.reset(v);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const field = (name: keyof AgencyValues, label: string, opts: { type?: string; placeholder?: string; description?: string } = {}) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field: f }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={opts.type ?? 'text'} placeholder={opts.placeholder} {...f} value={f.value ?? ''} />
          </FormControl>
          {opts.description && <FormDescription>{opts.description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-2xl" noValidate>
        {field('name', 'Agency name')}
        <div className="grid sm:grid-cols-2 gap-4">
          {field('registration_number', 'Companies House number', { placeholder: '12345678' })}
          {field('cqc_provider_id', 'CQC provider ID', { placeholder: '1-123456789', description: 'Shown on invoices. Find it on your CQC registration.' })}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {field('email', 'Office email', { type: 'email', placeholder: 'office@agency.co.uk' })}
          {field('phone', 'Office phone', { type: 'tel', placeholder: '020 1234 5678' })}
        </div>
        <FormField
          control={form.control}
          name="address"
          render={({ field: f }) => (
            <FormItem>
              <FormLabel>Business address</FormLabel>
              <FormControl>
                <Textarea rows={2} {...f} value={f.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="sm:w-1/2">{field('postcode', 'Postcode', { placeholder: 'SW1A 1AA' })}</div>
        <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
          {save.isPending ? 'Saving...' : 'Save details'}
        </Button>
      </form>
    </Form>
  );
};

const AgencyCodeCard: React.FC<{ code: string }> = ({ code }) => {
  const regenerate = useRegenerateAgencyCode();
  const [confirm, setConfirm] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Agency code copied');
    } catch {
      toast.error('Could not copy. Select the code and copy it manually.');
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 max-w-2xl mb-6">
      <p className="text-sm font-medium">Agency code</p>
      <p className="text-sm text-muted-foreground mb-3">
        Give this to caregivers and patients so they can create their accounts. Only share it with people you've checked.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-2xl font-bold tracking-widest bg-white border rounded-md px-4 py-1 select-all">{code}</span>
        <Button variant="outline" size="sm" onClick={copy}><Copy className="h-4 w-4 mr-1" />Copy</Button>
        <Button variant="outline" size="sm" onClick={() => setConfirm(true)} disabled={regenerate.isPending}>
          <RefreshCw className="h-4 w-4 mr-1" />New code
        </Button>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create a new agency code?</AlertDialogTitle>
            <AlertDialogDescription>
              The old code stops working straight away, so nobody new can join with it. People who already have accounts are not affected.
              Do this if the code was shared with someone it shouldn't have been.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current code</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  const next = await regenerate.mutateAsync();
                  toast.success(`New agency code: ${next}`);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Create new code
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ---------- Billing settings ----------

const billingSchema = z.object({
  default_payment_terms: z.coerce.number().int().min(0).max(90),
  default_hourly_rate: z.coerce.number().min(0, 'Cannot be negative.').max(500, 'That looks too high.'),
  bank_account_name: z.string().trim(),
  bank_sort_code: optional(z.string().trim().regex(/^\d{2}-?\d{2}-?\d{2}$/, 'Sort codes are 6 digits, e.g. 12-34-56.')),
  bank_account_number: optional(z.string().trim().regex(/^\d{8}$/, 'UK account numbers are 8 digits.')),
  invoice_footer: z.string().trim().max(500),
});
type BillingValues = z.infer<typeof billingSchema>;

const formatSortCode = (s: string) => {
  const d = s.replace(/\D/g, '');
  return d.length === 6 ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}` : s;
};

const BillingSettingsForm: React.FC<{ agency: AgencyRow }> = ({ agency }) => {
  const save = useSaveAgency();
  const form = useForm<BillingValues>({ resolver: zodResolver(billingSchema) });

  useEffect(() => {
    form.reset({
      default_payment_terms: agency.default_payment_terms ?? 14,
      default_hourly_rate: Number(agency.default_hourly_rate ?? 0),
      bank_account_name: agency.bank_account_name ?? '',
      bank_sort_code: agency.bank_sort_code ?? '',
      bank_account_number: agency.bank_account_number ?? '',
      invoice_footer: agency.invoice_footer ?? '',
    });
  }, [agency, form]);

  const onSubmit = async (v: BillingValues) => {
    const bankParts = [v.bank_account_name, v.bank_sort_code, v.bank_account_number].filter(Boolean).length;
    if (bankParts > 0 && bankParts < 3) {
      toast.error('Fill in all three bank fields (name, sort code, account number) or leave them all empty.');
      return;
    }
    try {
      const values = { ...v, bank_sort_code: formatSortCode(v.bank_sort_code) };
      await save.mutateAsync(values);
      toast.success('Billing settings saved');
      form.reset(values);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const c = form.control;
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl" noValidate>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField
            control={c}
            name="default_payment_terms"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default payment terms</FormLabel>
                <FormControl>
                  <select className={selectClass} {...field} value={field.value ?? 14}>
                    {[0, ...PAYMENT_TERMS].map((d) => (
                      <option key={d} value={d}>{d === 0 ? 'Due on receipt' : `${d} days`}</option>
                    ))}
                  </select>
                </FormControl>
                <FormDescription>Used as the due date for new invoices.</FormDescription>
              </FormItem>
            )}
          />
          <FormField
            control={c}
            name="default_hourly_rate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default hourly rate (£)</FormLabel>
                <FormControl>
                  <Input type="number" min="0" step="0.01" {...field} value={field.value ?? 0} />
                </FormControl>
                <FormDescription>Pre-filled when you add a new patient. Each patient can have their own rate.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div>
          <h3 className="font-medium mb-1">Bank details for payments</h3>
          <p className="text-sm text-muted-foreground mb-3">Printed on invoices so patients and families know where to pay.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {(
              [
                ['bank_account_name', 'Account name', 'Sunrise Homecare Ltd'],
                ['bank_sort_code', 'Sort code', '12-34-56'],
                ['bank_account_number', 'Account number', '12345678'],
              ] as const
            ).map(([name, label, placeholder]) => (
              <FormField
                key={name}
                control={c}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                      <Input placeholder={placeholder} inputMode={name === 'bank_account_name' ? 'text' : 'numeric'} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        </div>

        <FormField
          control={c}
          name="invoice_footer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Invoice footer (optional)</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="e.g. Please use your invoice number as the payment reference. Questions? Call the office." {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
          {save.isPending ? 'Saving...' : 'Save billing settings'}
        </Button>
      </form>
    </Form>
  );
};

// ---------- Page ----------

const AdminSettings: React.FC = () => {
  const { data: agency, isLoading, error, refetch } = useAgency();

  return (
    <Layout title="Settings" role="admin">
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6">
        <Tabs defaultValue="agency" className="w-full">
          <TabsList className="mb-6 flex-wrap h-auto">
            <TabsTrigger value="agency"><Building2 className="h-4 w-4 mr-2" />Agency</TabsTrigger>
            <TabsTrigger value="billing"><CreditCard className="h-4 w-4 mr-2" />Billing</TabsTrigger>
            <TabsTrigger value="account"><User className="h-4 w-4 mr-2" />My account</TabsTrigger>
          </TabsList>

          <TabsContent value="agency">
            {isLoading ? <LoadingState /> : error || !agency ? <ErrorState error={error} onRetry={refetch} /> : (
              <>
                <AgencyCodeCard code={agency.code} />
                <AgencyDetailsForm agency={agency} />
              </>
            )}
          </TabsContent>

          <TabsContent value="billing">
            {isLoading ? <LoadingState /> : error || !agency ? <ErrorState error={error} onRetry={refetch} /> : <BillingSettingsForm agency={agency} />}
          </TabsContent>

          <TabsContent value="account">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <KeyRound className="h-4 w-4" />
              These settings are for your own login, not the agency.
            </div>
            <MyAccount returnPath="/admin/settings" />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default AdminSettings;
