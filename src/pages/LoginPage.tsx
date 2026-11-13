import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { supabase, ROLE_HOME } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { FullPageSpinner } from '@/components/auth/ProtectedRoute';
import { fetchMyAgencies } from '@/hooks/data/useAgencies';

const formSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(1, "Please enter your password."),
});

type FormValues = z.infer<typeof formSchema>;

const LoginPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session, profile, loading, refreshProfile } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const handleLogin = async (data: FormValues) => {
    setSubmitting(true);
    const { data: auth, error } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });

    if (error) {
      setSubmitting(false);
      toast({
        variant: "destructive",
        title: "Sign in failed",
        description: error.message === "Email not confirmed"
          ? "Please confirm your email first. Check your inbox for the link."
          : error.message,
      });
      return;
    }

    // The role comes from the database, never from the form.
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role, first_name')
      .eq('id', auth.user.id)
      .maybeSingle();
    await refreshProfile();
    setSubmitting(false);

    if (!userProfile) {
      await supabase.auth.signOut();
      toast({ variant: "destructive", title: "Account not set up", description: "No profile found for this account." });
      return;
    }

    // Caregivers and patients who belong to several agencies choose one first.
    if (userProfile.role !== 'admin') {
      const agencies = await fetchMyAgencies().catch(() => []);
      if (agencies.length > 1) {
        navigate('/choose-agency');
        return;
      }
    }

    toast({ title: "Signed in", description: userProfile.first_name ? `Welcome back, ${userProfile.first_name}!` : "Welcome back!" });
    navigate(ROLE_HOME[userProfile.role as keyof typeof ROLE_HOME]);
  };

  if (loading) return <FullPageSpinner />;
  if (session && profile && !submitting) return <Navigate to={ROLE_HOME[profile.role]} replace />;

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Hero section */}
      <div className="bg-secondary md:w-1/2 p-8 flex flex-col justify-center">
        <div className="max-w-md mx-auto text-white">
          <h1 className="text-3xl md:text-4xl font-bold mb-4"><Link to="/" className="hover:text-accent">CareNest</Link></h1>
          <p className="text-xl mb-8">Healthcare coordination platform for homecare agencies, caregivers and patients.</p>
          <div className="space-y-6 text-sm">
            <div className="flex items-start">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-secondary font-bold mr-3 flex-shrink-0">1</div>
              <div>
                <h3 className="font-bold mb-1">Streamlined Care Coordination</h3>
                <p className="text-white/80">Schedule visits, track care delivery, and maintain clear communication between all stakeholders.</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-secondary font-bold mr-3 flex-shrink-0">2</div>
              <div>
                <h3 className="font-bold mb-1">Real-time Updates</h3>
                <p className="text-white/80">Access up-to-date information on patient care, caregiver activities, and visit status.</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-secondary font-bold mr-3 flex-shrink-0">3</div>
              <div>
                <h3 className="font-bold mb-1">Role-based Access</h3>
                <p className="text-white/80">Tailored interfaces designed specifically for agencies, caregivers and patients.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Login section */}
      <div className="md:w-1/2 p-8 flex flex-col justify-center bg-gray-50">
        <div className="max-w-md mx-auto w-full">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">Sign In</h2>
            <p className="text-gray-600">Access your CareNest account</p>
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" placeholder="Enter your email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" placeholder="Enter your password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex justify-end text-sm">
                <Link to="/forgot-password" className="font-medium text-primary hover:underline">
                  Forgot your password?
                </Link>
              </div>
              
              <Button className="w-full" type="submit" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </Form>

          <p className="text-center text-sm text-gray-600 mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </p>
          <p className="text-center text-xs text-gray-500 mt-4">
            <Link to="/privacy" className="hover:underline">Privacy policy</Link>
            {' · '}
            <Link to="/terms" className="hover:underline">Terms of use</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
