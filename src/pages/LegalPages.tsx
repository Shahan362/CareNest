import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// Privacy policy and terms for CareNest, written for UK homecare (UK GDPR / Data Protection Act 2018).
// TEMPLATE: an agency using CareNest for real care must check these with its data protection
// lead or a solicitor and add its own name, address and contact details.

const Page: React.FC<{ title: string; updated: string; children: React.ReactNode }> = ({ title, updated, children }) => (
  <div className="min-h-screen bg-gray-50">
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/" className="inline-flex items-center text-sm text-primary font-medium mb-6 hover:underline">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to CareNest
      </Link>
      <article className="bg-white rounded-lg border p-6 sm:p-10 text-sm leading-relaxed text-gray-800 space-y-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h2]:pt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="text-xs text-gray-500">Last updated {updated}</p>
        <p className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
          This is a template provided with CareNest. Your care agency is responsible for checking it and for how it uses
          your information. If anything here is unclear, ask your agency's office.
        </p>
        {children}
      </article>
    </div>
  </div>
);

export const PrivacyPage: React.FC = () => (
  <Page title="Privacy Policy" updated="13 November 2026">
    <h2>Who is responsible for your information</h2>
    <p>
      CareNest is used by homecare agencies to organise care. <b>Your care agency is the data controller</b>: it decides
      what information is collected and why. CareNest provides the software and stores the information on the agency's
      behalf (as a data processor). Contact your agency's office for any question about your information.
    </p>

    <h2>What we hold</h2>
    <ul>
      <li><b>Account details:</b> name, email, phone number and password (stored securely; we never see it).</li>
      <li><b>Patients:</b> address, date of birth, care plan, care instructions, emergency contact, GP practice, visit times, notes written by carers, requests, feedback, invoices and payments.</li>
      <li><b>Caregivers:</b> contact details, working area, availability, visits, check-in and check-out times, and care notes they write.</li>
      <li><b>Messages and notifications</b> between you and the agency office.</li>
    </ul>

    <h2>Why we use it (lawful basis)</h2>
    <ul>
      <li>To arrange and deliver your care, and to pay staff and bill for care: <b>contract</b> and <b>legal obligation</b> (UK GDPR Article 6(1)(b) and (c)).</li>
      <li>Health and care information is "special category" data. It is used for the <b>provision of health or social care</b> (Article 9(2)(h)) and kept confidential.</li>
      <li>Concerns about someone's safety may be shared with the local authority or emergency services where the law requires it (safeguarding).</li>
    </ul>

    <h2>Who can see it</h2>
    <ul>
      <li><b>Office staff</b> at your agency see everything needed to run the service.</li>
      <li><b>Caregivers</b> see only the patients they care for: care details, address, emergency contact and notes. They do not see prices or invoices.</li>
      <li><b>Patients and their families</b> (using the patient's login) see their own visits, notes, invoices, requests and messages. They see carers' names only.</li>
      <li>We do not sell your information or use it for advertising.</li>
    </ul>

    <h2>Where it is stored</h2>
    <p>
      Information is stored with our hosting provider (Supabase), encrypted in transit and at rest. Your agency should
      choose a UK or EU data region.
    </p>

    <h2>How long we keep it</h2>
    <p>
      Care records are kept for as long as the law and professional guidance require, which is usually <b>8 years after care
      ends</b> for adult social care in England. Account details are removed when an account is closed, unless they form
      part of the care record. Notifications can be cleared by you at any time.
    </p>

    <h2>Your rights</h2>
    <ul>
      <li>See a copy of your information: use <b>Download my data</b> on your profile page, or ask the office.</li>
      <li>Ask for something to be corrected, or object to how it's used.</li>
      <li>Ask for your information to be deleted, where the law allows (care records may need to be kept).</li>
      <li>Complain to the <b>Information Commissioner's Office</b> (ico.org.uk, 0303 123 1113) if you're unhappy with how your information is handled.</li>
    </ul>

    <h2>Cookies</h2>
    <p>
      CareNest only uses what is strictly necessary to keep you signed in and remember unsent notes on your device. There are no
      advertising or tracking cookies, so no cookie banner is needed.
    </p>
  </Page>
);

export const TermsPage: React.FC = () => (
  <Page title="Terms of Use" updated="13 November 2026">
    <h2>Using CareNest</h2>
    <p>
      CareNest is provided to you by your care agency. You may use it only for arranging, delivering and receiving care
      with that agency. Keep your password private and don't share your login, except that a family member may use a
      patient's login on the patient's behalf.
    </p>

    <h2>Not for emergencies</h2>
    <p>
      Messages and requests are answered during office hours. <b>In an emergency, call 999.</b> For anything urgent about a
      visit, phone your agency's office.
    </p>

    <h2>Caregivers</h2>
    <ul>
      <li>Check in when you arrive and check out when you leave, from the patient's home.</li>
      <li>Write accurate, factual care notes. They form part of the legal care record and cannot be changed afterwards.</li>
      <li>Only look at information about the patients you care for, and keep it confidential.</li>
      <li>Raise a concern straight away if you are worried about someone's safety.</li>
    </ul>

    <h2>Patients and families</h2>
    <ul>
      <li>Requests (for example cancelling a visit) are agreed by the office. Your care agreement may charge for short-notice cancellations.</li>
      <li>Invoices are payable by the date shown, using the details on the invoice.</li>
      <li>Please be respectful in messages and feedback. Complaints are taken seriously and answered in writing.</li>
    </ul>

    <h2>Office staff</h2>
    <ul>
      <li>Set caregivers who leave the agency to Inactive so they no longer see patient information.</li>
      <li>Turn on two-step verification for your login.</li>
    </ul>

    <h2>Availability</h2>
    <p>
      We aim to keep CareNest available at all times but can't guarantee it. Your agency keeps its own contingency plan (for
      example a printed rota) in case the service is unavailable.
    </p>

    <h2>Changes</h2>
    <p>We may update these terms. The date at the top shows the latest version.</p>
  </Page>
);
