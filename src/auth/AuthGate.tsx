import React, { useState, useEffect } from 'react';
import { authService } from '../services/auth/authService';
import { LoginPage } from './LoginPage';
import { SignupPage } from './SignupPage';
import { PendingApprovalPage } from './PendingApprovalPage';
import { AdminApprovalPage } from './AdminApprovalPage';
import { App } from '../app/App';
import { AuthSession } from '@shared/types';

export const AuthGate: React.FC = () => {
  const [session, setSession] = useState<AuthSession | null>(() => authService.getSession());
  const [currentHash, setCurrentHash] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.hash.toLowerCase();
    }
    return '';
  });

  useEffect(() => {
    const unsub = authService.subscribe((newSession) => {
      setSession(newSession);
    });

    const handleHashChange = () => {
      setCurrentHash(window.location.hash.toLowerCase());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      unsub();
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const isAuthenticated = Boolean(session?.token);
  const user = session?.user;
  const approvalStatus = user?.approvalStatus || 'pending';
  const isApproved = isAuthenticated && approvalStatus === 'approved';
  const isAdmin = isApproved && user?.role === 'administrator';

  // 1. Explicit Signup Screen
  if (currentHash === '#signup') {
    return <SignupPage onSuccess={() => {}} />;
  }

  // 2. Unauthenticated User (not logged in)
  if (!isAuthenticated) {
    return <LoginPage onSuccess={() => {}} />;
  }

  // 3. Authenticated but Pending, Rejected, or Suspended Approval
  if (approvalStatus !== 'approved' || currentHash === '#pending') {
    return (
      <PendingApprovalPage
        onApproved={() => {
          if (typeof window !== 'undefined') {
            window.location.hash = '#dashboard';
          }
        }}
        onLogout={() => {
          if (typeof window !== 'undefined') {
            window.location.hash = '#login';
          }
        }}
      />
    );
  }

  // 4. Admin Approvals Panel Route
  if (isAdmin && (currentHash === '#admin/approvals' || currentHash === '#admin')) {
    return (
      <AdminApprovalPage
        onBackToApp={() => {
          if (typeof window !== 'undefined') {
            window.location.hash = '#dashboard';
          }
        }}
      />
    );
  }

  // 5. Authenticated & Approved -> Mount operational Sentinel App
  return <App />;
};
