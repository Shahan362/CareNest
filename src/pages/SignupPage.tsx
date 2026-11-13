import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { Control, FieldValues, Path, useForm, UseFormReturn } from 'react-hook-form';
import * as z from 'zod';
import { Building2, HeartPulse, MailCheck, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { supabase, ROLE_HOME, type Role } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';


const ROLES: { value: Role; label: string; icon: React.ElementType; blurb: string }[] = [
  { value: 'admin', label: 'Agency', icon: Building2, blurb: 'Register a new homecare agency (you become its first admin).' },
  { value: 'caregiver', label: 'Caregiver', icon: HeartPulse, blurb: 'Join your agency to view your schedule, checklists and patient care plans.' },
  { value: 'patient', label: 'Patient', icon: User, blurb: 'Follow your visits, care plan and talk to your care team.' },
];

// ---------- Shared validation ----------

const phone = z
  .string()
  .trim()
  .min(7, 'Please enter a valid phone number.')
  .max(20, 'Please enter a valid phone number.')
  .regex(/^\+?[0-9\s()-]+$/, 'Phone number can only contain digits, spaces, +, ( ) and -.');

const postcode = z
  .string()
  .trim()
  .min(3, 'Please enter a valid postcode.')
  .max(10, 'Please enter a valid postcode.')
  .regex(/^[A-Za-z0-9\s-]+$/, 'Please enter a valid postcode.');

const passwordFields = {
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/[A-Za-z]/, 'Password must contain a letter.')
    .regex(/[0-9]/, 'Password must contain a number.'),
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine((v) => v, 'You must accept the terms to continue.'),
};

const passwordsMatch = <T extends { password: string; confirmPassword: string }>(data: T) =>
  data.password === data.confirmPassword;
const passwordsMatchError = { message: 'Passwords do not match.', path: ['confirmPassword'] };

const name = (label: string) => z.string().trim().min(1, `${label} is required.`);
const email = z.string().trim().email('Please enter a valid email address.');
const agencyCode = z.string().trim().min(1, 'Agency code is required. Ask your agency for it.');

const passwordDefaults = { password: '', confirmPassword: '', acceptTerms: false };

// ---------- Schemas per role ----------

const adminSchema = z
  .object({
    agencyName: name('Agency / company name'),
    registrationNumber: z
      .string()
      .trim()
      .min(1, 'Company registration number is required.')
      .regex(/^[A-Za-z0-9-]{4,20}$/, 'Please enter a valid registration number.'),
    agencyEmail: email,
    phone,
    businessAddress: z.string().trim().min(5, 'Please enter the full business address.'),
    postcode,
    ...passwordFields,
  })
  .refine(passwordsMatch, passwordsMatchError);

const caregiverSchema = z
  .object({
    firstName: name('First name'),
    lastName: name('Last name'),
    email,
    phone,
    agencyCode,
    ...passwordFields,
  })
  .refine(passwordsMatch, passwordsMatchError);

const patientSchema = z
  .object({
    firstName: name('First name'),
    lastName: name('Last name'),
    dateOfBirth: z.string().min(1, 'Date of birth is required.'),
    email,
    phone,
    address: z.string().trim().min(5, 'Please enter your full address.'),
    postcode,
    agencyCode,
    ...passwordFields,
  })
  .refine(passwordsMatch, passwordsMatchError);

// ---------- Reusable fields ----------

interface FieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
}

function TextField<T extends FieldValues>({ control, name, label, placeholder, type = 'text', autoComplete }: FieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} placeholder={placeholder} autoComplete={autoComplete} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function PasswordSection<T extends FieldValues>({ control }: { control: Control<T> }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField control={control} name={'password' as Path<T>} label="Password" type="password" placeholder="At least 8 characters" autoComplete="new-password" />
        <TextField control={control} name={'confirmPassword' as Path<T>} label="Confirm Password" type="password" placeholder="Re-enter password" autoComplete="new-password" />
      </div>
      <FormField
        control={control}
        name={'acceptTerms' as Path<T>}
        render={({ field }) => (
          <FormItem>
            <div className="flex items-start gap-2">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} className="mt-0.5" />
              </FormControl>
              <FormLabel className="text-sm font-normal leading-snug">
                I agree to the{' '}
                <a href="/terms" target="_blank" rel="noreferrer" className="text-primary hover:underline">Terms of Use</a> and{' '}
                <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">Privacy Policy</a>
              </FormLabel>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide pt-2">{children}</h3>
);

// ---------- Role forms ----------

/** Error to show on a specific field, or a general error when field is omitted. */
type SubmitError = { field?: string; message: string };

interface SignupRequest {
  role: Role;
  email: string;
  password: string;
  displayName: string;
  agencyCode?: string;
  metadata: Record<string, string>;
}

type OnSubmit = (req: SignupRequest) => Promise<SubmitError | null>;

/** Runs the signup request and puts any error on the matching form field. */
function useSignupSubmit<T extends FieldValues>(form: UseFormReturn<T>, onSubmit: OnSubmit) {
  return async (req: SignupRequest) => {
    const err = await onSubmit(req);
    if (!err) return;
    if (err.field) form.setError(err.field as Path<T>, { message: err.message });
    else form.setError('root', { message: err.message });
  };
}

const RootError: React.FC<{ message?: string }> = ({ message }) =>
  message ? <p className="text-sm font-medium text-destructive">{message}</p> : null;

const AdminSignupForm: React.FC<{ onSubmit: OnSubmit }> = ({ onSubmit }) => {
  const form = useForm<z.infer<typeof adminSchema>>({
    resolver: zodResolver(adminSchema),
    defaultValues: {
      agencyName: '',
      registrationNumber: '',
      agencyEmail: '',
      phone: '',
      businessAddress: '',
      postcode: '',
      ...passwordDefaults,
    },
  });
  const c = form.control;
  const submit = useSignupSubmit(form, onSubmit);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((d) =>
          submit({
            role: 'admin',
            email: d.agencyEmail,
            password: d.password,
            displayName: d.agencyName,
            metadata: {
              agency_name: d.agencyName,
              registration_number: d.registrationNumber,
              phone: d.phone,
              address: d.businessAddress,
              postcode: d.postcode,
            },
          }),
        )}
        className="space-y-4"
        noValidate
      >
        <SectionTitle>Agency details</SectionTitle>
        <TextField control={c} name="agencyName" label="Agency / Company Name" placeholder="e.g. Sunrise Homecare Ltd" autoComplete="organization" />
        <TextField control={c} name="registrationNumber" label="Company Registration Number" placeholder="e.g. 12345678" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField control={c} name="agencyEmail" label="Agency Email Address" type="email" placeholder="office@agency.com" autoComplete="email" />
          <TextField control={c} name="phone" label="Phone Number" type="tel" placeholder="e.g. 020 1234 5678" autoComplete="tel" />
        </div>
        <TextField control={c} name="businessAddress" label="Business Address" placeholder="Street, town / city" autoComplete="street-address" />
        <TextField control={c} name="postcode" label="Postcode" placeholder="e.g. SW1A 1AA" autoComplete="postal-code" />

        <SectionTitle>Account security</SectionTitle>
        <PasswordSection control={c} />
        <RootError message={form.formState.errors.root?.message} />
        <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Registering...' : 'Register Agency'}
        </Button>
      </form>
    </Form>
  );
};

const CaregiverSignupForm: React.FC<{ onSubmit: OnSubmit }> = ({ onSubmit }) => {
  const form = useForm<z.infer<typeof caregiverSchema>>({
    resolver: zodResolver(caregiverSchema),
    defaultValues: { firstName: '', lastName: '', email: '', phone: '', agencyCode: '', ...passwordDefaults },
  });
  const c = form.control;
  const submit = useSignupSubmit(form, onSubmit);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((d) =>
          submit({
            role: 'caregiver',
            email: d.email,
            password: d.password,
            displayName: d.firstName,
            agencyCode: d.agencyCode,
            metadata: {
              first_name: d.firstName,
              last_name: d.lastName,
              phone: d.phone,
              agency_code: d.agencyCode,
            },
          }),
        )}
        className="space-y-4"
        noValidate
      >
        <SectionTitle>Personal details</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField control={c} name="firstName" label="First Name" autoComplete="given-name" />
          <TextField control={c} name="lastName" label="Last Name" autoComplete="family-name" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField control={c} name="email" label="Email" type="email" placeholder="you@example.com" autoComplete="email" />
          <TextField control={c} name="phone" label="Phone Number" type="tel" autoComplete="tel" />
        </div>

        <SectionTitle>Agency</SectionTitle>
        <TextField control={c} name="agencyCode" label="Agency Code" placeholder="Provided by your agency" />

        <SectionTitle>Account security</SectionTitle>
        <PasswordSection control={c} />
        <RootError message={form.formState.errors.root?.message} />
        <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Creating account...' : 'Create Caregiver Account'}
        </Button>
      </form>
    </Form>
  );
};

const PatientSignupForm: React.FC<{ onSubmit: OnSubmit }> = ({ onSubmit }) => {
  const form = useForm<z.infer<typeof patientSchema>>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      firstName: '', lastName: '', dateOfBirth: '', email: '', phone: '', address: '', postcode: '', agencyCode: '',
      ...passwordDefaults,
    },
  });
  const c = form.control;
  const submit = useSignupSubmit(form, onSubmit);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((d) =>
          submit({
            role: 'patient',
            email: d.email,
            password: d.password,
            displayName: d.firstName,
            agencyCode: d.agencyCode,
            metadata: {
              first_name: d.firstName,
              last_name: d.lastName,
              date_of_birth: d.dateOfBirth,
              phone: d.phone,
              address: d.address,
              postcode: d.postcode,
              agency_code: d.agencyCode,
            },
          }),
        )}
        className="space-y-4"
        noValidate
      >
        <SectionTitle>Personal details</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField control={c} name="firstName" label="First Name" autoComplete="given-name" />
          <TextField control={c} name="lastName" label="Last Name" autoComplete="family-name" />
        </div>
        <TextField control={c} name="dateOfBirth" label="Date of Birth" type="date" autoComplete="bday" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField control={c} name="email" label="Email" type="email" placeholder="you@example.com" autoComplete="email" />
          <TextField control={c} name="phone" label="Phone Number" type="tel" autoComplete="tel" />
        </div>
        <TextField control={c} name="address" label="Home Address" placeholder="Street, town / city" autoComplete="street-address" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField control={c} name="postcode" label="Postcode" autoComplete="postal-code" />
          <TextField control={c} name="agencyCode" label="Agency Code" placeholder="Provided by your agency" />
        </div>

        <SectionTitle>Account security</SectionTitle>
        <PasswordSection control={c} />
        <RootError message={form.formState.errors.root?.message} />
        <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Creating account...' : 'Create Patient Account'}
        </Button>
      </form>
    </Form>
  );
};

// ---------- Page ----------

const isRole = (v: string | null): v is Role => !!v && ROLES.some((r) => r.value === v);

const SignupPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const role: Role = isRole(roleParam) ? roleParam : 'admin';
  const active = ROLES.find((r) => r.value === role)!;

  const { refreshProfile } = useAuth();
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  const handleSubmit: OnSubmit = async ({ role: r, email: userEmail, password, displayName, agencyCode: code, metadata }) => {
    const emailField = r === 'admin' ? 'agencyEmail' : 'email';
    const takenMessage =
      r === 'admin'
        ? 'An account with this email already exists.'
        : 'This email already has a CareNest account. Sign in, then choose "Switch or join agency" to add this agency with its code.';

    // Check the agency code first so we can show a clear error on that field.
    if (code) {
      const { data: exists, error } = await supabase.rpc('agency_code_exists', { p_code: code });
      if (error) return { message: 'Could not check the agency code. Please try again.' };
      if (!exists) return { field: 'agencyCode', message: 'This agency code is not valid. Check it with your agency.' };
    }

    const { data, error } = await supabase.auth.signUp({
      email: userEmail,
      password,
      options: {
        data: { role: r, ...metadata },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      if (/rate limit/i.test(error.message)) {
        return { message: 'Too many sign-up emails were sent recently. Please wait a few minutes and try again.' };
      }
      if (/already registered/i.test(error.message)) {
        return { field: emailField, message: takenMessage };
      }
      return { message: error.message };
    }

    // With email confirmation on, Supabase hides taken emails by returning a user with no identities.
    if (data.user && data.user.identities?.length === 0) {
      return { field: emailField, message: takenMessage };
    }

    if (!data.session) {
      // Email confirmation is on: the user must click the link before signing in.
      setConfirmEmail(userEmail);
      return null;
    }

    await refreshProfile();
    toast({
      title: 'Account created',
      description: r === 'admin' ? `${displayName} has been registered.` : `Welcome to CareNest, ${displayName}!`,
    });
    navigate(ROLE_HOME[r]);
    return null;
  };

  if (confirmEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border p-8 text-center">
          <MailCheck className="h-12 w-12 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Check your email</h2>
          <p className="text-gray-600 mb-6">
            We sent a confirmation link to <span className="font-medium">{confirmEmail}</span>. Click it to activate your account, then sign in.
          </p>
          <Button asChild className="w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Hero section */}
      <div className="bg-secondary md:w-5/12 p-8 flex flex-col justify-center">
        <div className="max-w-md mx-auto text-white">
          <h1 className="text-3xl md:text-4xl font-bold mb-4"><Link to="/" className="hover:text-accent">CareNest</Link></h1>
          <p className="text-xl mb-6">Create your account</p>
          <p className="text-white/80 hidden md:block">{active.blurb}</p>
        </div>
      </div>

      {/* Sign-up section */}
      <div className="md:w-7/12 p-4 sm:p-8 flex flex-col justify-center bg-gray-50">
        <div className="max-w-xl mx-auto w-full py-4">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">Sign Up</h2>
            <p className="text-gray-600">Choose the type of account you need</p>
          </div>

          <Tabs value={role} onValueChange={(v) => setSearchParams({ role: v }, { replace: true })}>
            <TabsList className="grid grid-cols-3 w-full h-auto mb-6">
              {ROLES.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="flex flex-col sm:flex-row gap-1 py-2 text-xs sm:text-sm">
                  <Icon className="h-4 w-4" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <p className="text-sm text-gray-600 mb-4 md:hidden">{active.blurb}</p>

            <TabsContent value="admin"><AdminSignupForm onSubmit={handleSubmit} /></TabsContent>
            <TabsContent value="caregiver"><CaregiverSignupForm onSubmit={handleSubmit} /></TabsContent>
            <TabsContent value="patient"><PatientSignupForm onSubmit={handleSubmit} /></TabsContent>
          </Tabs>

          <p className="text-center text-sm text-gray-600 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
