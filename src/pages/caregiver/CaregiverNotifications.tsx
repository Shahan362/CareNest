import React from 'react';
import Layout from '@/components/layout/Layout';
import NotificationsView from '@/components/notifications/NotificationsView';

const CaregiverNotifications: React.FC = () => (
  <Layout title="Notifications" role="caregiver">
    <NotificationsView explainer="You'll be told here when the office adds, moves or cancels your visits, sends you a message, or a patient pays you a compliment." />
  </Layout>
);

export default CaregiverNotifications;
