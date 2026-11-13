import React from 'react';
import Layout from '@/components/layout/Layout';
import ChatThread from '@/components/messages/ChatThread';
import OfficeContactNote from '@/components/messages/OfficeContactNote';
import { useAuth } from '@/contexts/AuthContext';

/** The caregiver's conversation with the office (rota questions, sickness, updates). */
const CaregiverMessages: React.FC = () => {
  const { user } = useAuth();
  return (
    <Layout title="Messages" role="caregiver">
      <OfficeContactNote />
      {user && (
        <ChatThread
          threadUserId={user.id}
          className="h-[calc(100vh-15rem)]"
          emptyText="No messages yet. Use this to ask the office about your rota, let them know if you're running late or unwell, or share an update about a patient."
          placeholder="Message the office"
        />
      )}
    </Layout>
  );
};

export default CaregiverMessages;
