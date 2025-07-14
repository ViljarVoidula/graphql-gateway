import { Notification } from '@mantine/core';
import { IconCheck, IconRefresh, IconX } from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';

interface TokenRefreshNotificationProps {
  onClose?: () => void;
}

export const TokenRefreshNotification: React.FC<TokenRefreshNotificationProps> = ({ onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [status, setStatus] = useState<'refreshing' | 'success' | 'error'>('refreshing');

  useEffect(() => {
    // Listen for token refresh events
    const handleTokenRefresh = (event: CustomEvent) => {
      setStatus(event.detail.status);
      setIsVisible(true);

      if (event.detail.status !== 'refreshing') {
        // Auto-hide after 3 seconds for success/error
        setTimeout(() => {
          setIsVisible(false);
          onClose?.();
        }, 3000);
      }
    };

    // Listen for custom token refresh events
    window.addEventListener('tokenRefresh', handleTokenRefresh as EventListener);

    return () => {
      window.removeEventListener('tokenRefresh', handleTokenRefresh as EventListener);
    };
  }, [onClose]);

  if (!isVisible) return null;

  const getNotificationProps = () => {
    switch (status) {
      case 'refreshing':
        return {
          color: 'blue',
          title: 'Refreshing session...',
          icon: <IconRefresh size={16} />,
          loading: true
        };
      case 'success':
        return {
          color: 'green',
          title: 'Session refreshed successfully',
          icon: <IconCheck size={16} />
        };
      case 'error':
        return {
          color: 'red',
          title: 'Failed to refresh session',
          icon: <IconX size={16} />
        };
      default:
        return {};
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 1000,
        width: 350
      }}
    >
      <Notification
        {...getNotificationProps()}
        onClose={
          status !== 'refreshing'
            ? () => {
                setIsVisible(false);
                onClose?.();
              }
            : undefined
        }
      >
        {status === 'refreshing' && 'Your session is being extended...'}
        {status === 'success' && 'Your session has been extended for another 15 minutes.'}
        {status === 'error' && 'Please log in again to continue using the application.'}
      </Notification>
    </div>
  );
};
