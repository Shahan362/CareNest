import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  HeartHandshake,
  HeartPulse,
  KeyRound,
  Lock,
  Menu,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_HOME } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// Public welcome page at "/". Describes only what CareNest really does.

const AUDIENCES = [
  {
    icon: Building2,
    title: 'Care agencies',
    role: 'admin',
    cta: 'Register your agency',
    color: 'bg-blue-50 text-primary',
    points: [
      'Plan visits on a weekly scheduler with clash checks',
      'See late visits and concerns the moment they happen',
      'Invoice families in £ straight from completed visits',
    ],
  },
  {
    icon: HeartPulse,
    title: 'Caregivers',
    role: 'caregiver',
    cta: 'Join as a caregiver',
    color: 'bg-teal-50 text-teal-700',
    points: [
      'Your day at a glance, with directions to each home',
      'Check in and out, tick off tasks, write care notes',
      'Raise a concern straight to the office',
    ],
  },
  {
    icon: User,
    title: 'Patients & families',
    role: 'patient',
    cta: 'Join as a patient',
    color: 'bg-rose-50 text-rose-700',
    points: [
      'Know who is coming and when',
      'Read care notes after every visit',
      'Ask for changes, give feedback and pay invoices',
    ],
  },
] as const;

const FEATURES = [
  { icon: CalendarCheck, title: 'Smart scheduling', text: 'Repeat visits daily or weekly, spot clashes before they happen and get caregiver suggestions ranked by who is free.' },
  { icon: ClipboardCheck, title: 'Visit check-in & care notes', text: 'Caregivers check in on arrival, complete the task list and leave a note, so the care record is written as care happens.' },
  { icon: BellRing, title: 'Live notifications', text: 'Changes to a visit, new requests, concerns and messages reach the right person instantly, on any device.' },
  { icon: MessageSquare, title: 'Messages with the office', text: 'Caregivers and families talk to the office in one simple thread, with read receipts. No more lost phone messages.' },
  { icon: HeartHandshake, title: 'Requests & feedback', text: 'Families ask for extra visits or changes and share compliments or complaints. Every one is tracked to an answer.' },
  { icon: FileText, title: 'Billing in pounds', text: 'Invoices are built from completed visits at each patient’s hourly rate, with part payments and overdue reminders.' },
];

const STEPS = [
  { title: 'Register your agency', text: 'Sign up as an agency in under a minute. You get your own private space and a unique agency code.' },
  { title: 'Add your people', text: 'Add patients and caregivers, then share your agency code with them so they can create their own logins.' },
  { title: 'Start caring', text: 'Schedule visits and everyone sees what matters to them: the office, the caregiver and the family.' },
];

/** A small, static picture of the caregiver's day, used as the hero illustration. */
const HeroPreview: React.FC = () => (
  <div className="relative mx-auto w-full max-w-md pb-[68px]">
    <div className="absolute -inset-6 rounded-[2rem] bg-accent/20 blur-3xl" aria-hidden />
    <div className="relative rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div>
          <p className="text-xs text-gray-500">Today’s visits</p>
          <p className="font-semibold text-gray-900">Monday, 16 November</p>
        </div>
        <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">3 visits</span>
      </div>
      <ul className="divide-y">
        {[
          { time: '08:00', name: 'Margaret E.', task: 'Morning routine · medication', state: 'done' },
          { time: '11:30', name: 'Arthur P.', task: 'Lunch · companionship', state: 'now' },
          { time: '17:00', name: 'Joan W.', task: 'Evening meal · bedtime', state: 'next' },
        ].map((v) => (
          <li key={v.time} className="flex items-center gap-3 px-5 py-3.5">
            <span className="w-12 text-sm font-medium text-gray-500">{v.time}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-gray-900">{v.name}</span>
              <span className="block truncate text-xs text-gray-500">{v.task}</span>
            </span>
            {v.state === 'done' && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700"><CheckCircle2 className="h-4 w-4" />Done</span>
            )}
            {v.state === 'now' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />In progress
              </span>
            )}
            {v.state === 'next' && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500"><Clock className="h-4 w-4" />Later</span>
            )}
          </li>
        ))}
      </ul>
    </div>

    <div className="absolute bottom-0 -left-2 sm:-left-10 w-60 rounded-xl bg-white p-3.5 shadow-xl ring-1 ring-black/5">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageSquare className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-900">Care note from Amira</p>
          <p className="text-xs text-gray-600 leading-snug">Margaret ate well and was in good spirits today.</p>
        </div>
      </div>
    </div>
  </div>
);

const LandingPage: React.FC = () => {
  const { session, profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const dashboard = session && profile ? ROLE_HOME[profile.role] : null;

  const authButtons = (stacked = false) =>
    dashboard ? (
      <Button asChild className={cn(stacked && 'w-full')}>
        <Link to={dashboard}>Go to my dashboard</Link>
      </Button>
    ) : (
      <>
        <Button asChild variant="ghost" className={cn('text-white hover:bg-white/10 hover:text-white', stacked && 'w-full')}>
          <Link to="/login">Log in</Link>
        </Button>
        <Button asChild className={cn('bg-accent text-secondary hover:bg-accent/90', stacked && 'w-full')}>
          <Link to="/signup">Sign up</Link>
        </Button>
      </>
    );

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ---------- Hero ---------- */}
      <header className="relative overflow-hidden bg-secondary text-white">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
          <div className="absolute top-1/2 -left-40 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        </div>

        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-5">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-secondary">
              <HeartHandshake className="h-5 w-5" />
            </span>
            CareNest
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-white/80">
            <a href="#who" className="hover:text-white">Who it’s for</a>
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#privacy" className="hover:text-white">Privacy</a>
          </div>
          <div className="hidden md:flex items-center gap-2">{authButtons()}</div>
          <button
            type="button"
            className="md:hidden rounded-md p-2 hover:bg-white/10"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </nav>

        {menuOpen && (
          <div className="relative md:hidden mx-4 mb-4 rounded-xl bg-white/10 p-4 backdrop-blur space-y-1">
            {[
              ['#who', 'Who it’s for'],
              ['#features', 'Features'],
              ['#how', 'How it works'],
              ['#privacy', 'Privacy'],
            ].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block rounded-md px-3 py-2 text-white/90 hover:bg-white/10">
                {label}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-2">{authButtons(true)}</div>
          </div>
        )}

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 pt-10 pb-24 md:pt-16 md:pb-32 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-accent ring-1 ring-white/15">
              <Sparkles className="h-3.5 w-3.5" />
              Made for UK homecare
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Care at home,
              <br />
              <span className="bg-gradient-to-r from-accent to-sky-300 bg-clip-text text-transparent">beautifully organised.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/80 leading-relaxed">
              CareNest brings care agencies, caregivers and families together in one calm, simple place. Plan every
              visit, record every moment of care and keep everyone in the loop.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              {dashboard ? (
                <Button asChild size="lg" className="bg-accent text-secondary hover:bg-accent/90 text-base">
                  <Link to={dashboard}>Go to my dashboard <ArrowRight className="ml-2 h-5 w-5" /></Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="lg" className="bg-accent text-secondary hover:bg-accent/90 text-base">
                    <Link to="/signup">Get started free <ArrowRight className="ml-2 h-5 w-5" /></Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white text-base">
                    <Link to="/login">I already have an account</Link>
                  </Button>
                </>
              )}
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-accent" />Works on phone, tablet and computer</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-accent" />Nothing to install</li>
            </ul>
          </div>
          <HeroPreview />
        </div>
      </header>

      {/* ---------- Who it's for ---------- */}
      <section id="who" className="scroll-mt-4 mx-auto max-w-6xl px-4 sm:px-6 py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">One platform, three views</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Everyone in the circle of care</h2>
          <p className="mt-4 text-lg text-gray-600">Each person sees exactly what they need, and nothing they shouldn’t.</p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {AUDIENCES.map((a) => (
            <div key={a.title} className="group flex flex-col rounded-2xl border bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
              <span className={cn('flex h-12 w-12 items-center justify-center rounded-xl', a.color)}>
                <a.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-xl font-semibold">{a.title}</h3>
              <ul className="mt-4 flex-1 space-y-3">
                {a.points.map((p) => (
                  <li key={p} className="flex gap-2.5 text-gray-600">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              {!dashboard && (
                <Link to={`/signup?role=${a.role}`} className="mt-6 inline-flex items-center text-sm font-semibold text-primary hover:underline">
                  {a.cta} <ArrowRight className="ml-1 h-4 w-4 transition group-hover:translate-x-1" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="scroll-mt-4 bg-gray-50 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Features</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Everything a homecare day needs</h2>
            <p className="mt-4 text-lg text-gray-600">Less paperwork and fewer phone calls, so there’s more time for care.</p>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl bg-white p-7 ring-1 ring-gray-200/70">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-accent">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-gray-600 leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="scroll-mt-4 mx-auto max-w-6xl px-4 sm:px-6 py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">How it works</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Up and running in minutes</h2>
        </div>
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative text-center md:px-4">
              {i < STEPS.length - 1 && (
                <span className="absolute left-1/2 top-7 hidden h-px w-full bg-gradient-to-r from-primary/40 to-accent/40 md:block" aria-hidden />
              )}
              <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-white shadow-lg shadow-primary/30">
                {i + 1}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-gray-600 leading-relaxed">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Privacy ---------- */}
      <section id="privacy" className="scroll-mt-4 mx-auto max-w-6xl px-4 sm:px-6 pb-20 md:pb-28">
        <div className="grid items-center gap-10 rounded-3xl bg-gradient-to-br from-secondary to-[#0f1d33] p-8 text-white sm:p-12 lg:grid-cols-2">
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-accent">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight">Health information deserves care too</h2>
            <p className="mt-4 text-white/75 leading-relaxed">
              CareNest is designed around UK GDPR. Every agency’s information is kept separate, and each person only
              ever sees what their role allows.
            </p>
            <Link to="/privacy" className="mt-6 inline-flex items-center text-sm font-semibold text-accent hover:underline">
              Read our privacy policy <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Lock, title: 'Role-based access', text: 'Caregivers see only the patients they care for. Families see only their own care.' },
              { icon: KeyRound, title: 'Two-step verification', text: 'Protect any login with an authenticator app, enforced for office accounts once turned on.' },
              { icon: Building2, title: 'Agencies kept apart', text: 'Each agency’s data is isolated at the database level.' },
              { icon: FileText, title: 'Download my data', text: 'Anyone can download a copy of the information held about them.' },
            ].map((p) => (
              <li key={p.title} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                <p.icon className="h-5 w-5 text-accent" />
                <p className="mt-3 font-semibold">{p.title}</p>
                <p className="mt-1 text-sm text-white/70 leading-relaxed">{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- Final call to action ---------- */}
      {!dashboard && (
        <section className="bg-gray-50 py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready to bring calm to your care?</h2>
            <p className="mt-4 text-lg text-gray-600">Create your agency’s space today. It only takes a minute.</p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
              <Button asChild size="lg" className="text-base">
                <Link to="/signup">Sign up <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-base">
                <Link to="/login">Log in</Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ---------- Footer ---------- */}
      <footer className="border-t bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:px-6 py-8 text-sm text-gray-500 sm:flex-row">
          <div className="flex items-center gap-2 font-semibold text-gray-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-accent">
              <HeartHandshake className="h-4 w-4" />
            </span>
            CareNest
          </div>
          <p>© {new Date().getFullYear()} CareNest. Homecare, organised.</p>
          <div className="flex gap-5">
            <Link to="/privacy" className="hover:text-gray-900">Privacy</Link>
            <Link to="/terms" className="hover:text-gray-900">Terms</Link>
            {!dashboard && <Link to="/login" className="hover:text-gray-900">Log in</Link>}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
