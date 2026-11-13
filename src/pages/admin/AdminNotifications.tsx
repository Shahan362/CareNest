import React from 'react';
import Layout from '@/components/layout/Layout';
import NotificationsView from '@/components/notifications/NotificationsView';

const AdminNotifications: React.FC = () => (
  <Layout title="Notifications" role="admin">
    <NotificationsView explainer="New requests, complaints, compliments, concerns from carers, sign-ups and messages appear here." />
  </Layout>
);

export default AdminNotifications;
