import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import ChatThread from '@/components/messages/ChatThread';
import OfficeContactNote from '@/components/messages/OfficeContactNote';
import { useAuth } from '@/contexts/AuthContext';

/** The patient's (or family's) conversation with the office. */
const PatientMessages: React.FC = () => {
  const { user } = useAuth();
  return (
    <Layout title="Messages" role="patient">
      <OfficeContactNote />
      <p className="text-xs text-muted-foreground mb-3">
        To change or cancel a visit, please use <Link to="/patient/requests" className="text-primary hover:underline">Requests</Link> so the office can track it.
      </p>
      {user && (
        <ChatThread
          threadUserId={user.id}
          className="h-[calc(100vh-17rem)]"
          emptyText="No messages yet. You can ask the office a question here, for example about your care, an invoice or a carer."
          placeholder="Message the office"
        />
      )}
    </Layout>
  );
};

export default PatientMessages;
