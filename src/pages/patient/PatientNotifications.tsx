import React from 'react';
import Layout from '@/components/layout/Layout';
import NotificationsView from '@/components/notifications/NotificationsView';

const PatientNotifications: React.FC = () => (
  <Layout title="Notifications" role="patient">
    <NotificationsView explainer="You'll be told here when a visit time or carer changes, the office answers a request, or a new invoice is ready." />
  </Layout>
);

export default PatientNotifications;
