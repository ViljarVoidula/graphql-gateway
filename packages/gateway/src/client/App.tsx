import { Alert, Button, Center, Global, Loader, MantineProvider, Stack, Text } from '@mantine/core';
import { NotificationsProvider } from '@mantine/notifications';
import { Authenticated, Refine } from '@refinedev/core';
import { RefineKbar, RefineKbarProvider } from '@refinedev/kbar';
import { ErrorComponent, notificationProvider } from '@refinedev/mantine';
import routerProvider from '@refinedev/react-router-v6';
import {
  IconAdjustments,
  IconAlertCircle,
  IconApps,
  IconFingerprint,
  IconRefresh,
  IconServer,
  IconUserCircle
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { CustomLayout } from './components/CustomLayout';
import { ApplicationList } from './pages/applications';
import { ApplicationCreate } from './pages/applications/create';
import { ApplicationDetail } from './pages/applications/detail';
import { Dashboard } from './pages/dashboard';
import { DocsContentManager } from './pages/docs/content';
import { DocsThemeEditor } from './pages/docs/theme';
import GetStarted, { SetupStatus } from './pages/get-started';
import { Login } from './pages/login';
import { ServiceList } from './pages/services';
import { ServiceCreate } from './pages/services/create';
import { ServiceDetail } from './pages/services/detail';
import { ServiceEdit } from './pages/services/edit';
import { SessionList } from './pages/sessions';
import { SessionSettings } from './pages/settings';
import { UserCreate } from './pages/users/create';
import { UserDetail } from './pages/users/detail';
import { UserEdit } from './pages/users/edit';
import { UserList } from './pages/users/list';
import { authProvider } from './providers/auth';
import { dataProvider } from './providers/data';
import { setupTokenRefreshTimer } from './utils/auth';

const INITIAL_SETUP_QUERY = `
  query InitialSetupStatus {
    initialSetupStatus {
      needsInitialAdmin
      hasAnyUsers
      setupComplete
      lastCompletedStage
      nextStage
    }
  }
`;

async function fetchSetupStatus(): Promise<SetupStatus> {
  const response = await fetch('/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ query: INITIAL_SETUP_QUERY })
  });

  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'Failed to load setup status');
  }
  if (!json.data?.initialSetupStatus) {
    throw new Error('Initial setup status response was empty');
  }
  return json.data.initialSetupStatus as SetupStatus;
}

const SetupLoadingScreen = () => (
  <Center style={{ minHeight: '100vh' }}>
    <Stack align="center" spacing="md">
      <Loader size="lg" />
      <Text color="dimmed">Preparing your admin experience…</Text>
    </Stack>
  </Center>
);

type SetupErrorScreenProps = { message: string; onRetry: () => void };

const SetupErrorScreen = ({ message, onRetry }: SetupErrorScreenProps) => (
  <Center style={{ minHeight: '100vh', padding: '2rem' }}>
    <Stack align="center" spacing="md" sx={{ maxWidth: 420 }}>
      <Alert icon={<IconAlertCircle size={16} />} color="red" radius="md" title="Couldn't load setup status">
        {message}
      </Alert>
      <Button variant="light" leftIcon={<IconRefresh size={16} />} onClick={onRetry}>
        Retry
      </Button>
    </Stack>
  </Center>
);

function App() {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  useEffect(() => {
    // Setup automatic token refresh timer
    const cleanup = setupTokenRefreshTimer();

    // Cleanup on unmount
    return cleanup;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const status = await fetchSetupStatus();
        if (!cancelled) {
          setSetupStatus(status);
          setSetupError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load setup status';
          setSetupError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingSetup(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSetupStatus = useCallback(async () => {
    try {
      const status = await fetchSetupStatus();
      setSetupStatus(status);
      setSetupError(null);
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load setup status';
      setSetupError(message);
      throw error;
    }
  }, []);

  const retryInitialLoad = useCallback(async () => {
    setLoadingSetup(true);
    try {
      await refreshSetupStatus();
    } catch {
      // handled in refreshSetupStatus
    } finally {
      setLoadingSetup(false);
    }
  }, [refreshSetupStatus]);

  const handleOnboardingComplete = useCallback((status: SetupStatus) => {
    setSetupStatus(status);
    setSetupError(null);
  }, []);

  const shouldShowWizard = !loadingSetup && setupStatus !== null && !setupStatus.setupComplete;
  const shouldShowError = !loadingSetup && !!setupError && (!setupStatus || !setupStatus.setupComplete);

  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <MantineProvider
          theme={{
            colorScheme: 'light',
            primaryColor: 'blue'
          }}
          withGlobalStyles
          withNormalizeCSS
        >
          <Global
            styles={{
              body: { WebkitFontSmoothing: 'auto' }
            }}
          />
          <NotificationsProvider position="top-right">
            {loadingSetup ? (
              <SetupLoadingScreen />
            ) : shouldShowError ? (
              <SetupErrorScreen message={setupError ?? 'Unknown error'} onRetry={retryInitialLoad} />
            ) : shouldShowWizard && setupStatus ? (
              <GetStarted status={setupStatus} refreshStatus={refreshSetupStatus} onComplete={handleOnboardingComplete} />
            ) : (
              <Refine
                routerProvider={routerProvider}
                dataProvider={dataProvider}
                authProvider={authProvider}
                notificationProvider={notificationProvider}
                resources={[
                  {
                    name: 'users',
                    list: '/users',
                    show: '/users/:id',
                    create: '/users/create',
                    edit: '/users/:id/edit',
                    meta: {
                      canDelete: true,
                      icon: <IconUserCircle size={18} />,
                      label: 'Users'
                    }
                  },
                  {
                    name: 'applications',
                    list: '/applications',
                    show: '/applications/:id',
                    create: '/applications/create',
                    meta: {
                      canDelete: false,
                      icon: <IconApps size={18} />,
                      label: 'Applications'
                    }
                  },
                  {
                    name: 'services',
                    list: '/services',
                    show: '/services/:id',
                    create: '/services/create',
                    edit: '/services/:id/edit',
                    meta: {
                      canDelete: true,
                      icon: <IconServer size={18} />,
                      label: 'Services'
                    }
                  },
                  {
                    name: 'sessions',
                    list: '/sessions',
                    meta: {
                      canDelete: true,
                      icon: <IconFingerprint size={18} />,
                      label: 'Sessions'
                    }
                  },
                  {
                    name: 'settings',
                    list: '/settings',
                    meta: {
                      label: 'Settings',
                      icon: <IconAdjustments size={18} />
                    }
                  }
                ]}
                options={{
                  syncWithLocation: true,
                  warnWhenUnsavedChanges: true,
                  projectId: 'gateway-admin'
                }}
              >
                <Routes>
                  <Route
                    element={
                      <Authenticated key="authenticated-routes" fallback={<Login />}>
                        <CustomLayout>
                          <Outlet />
                        </CustomLayout>
                      </Authenticated>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="/users" element={<UserList />} />
                    <Route path="/users/create" element={<UserCreate />} />
                    <Route path="/users/:id" element={<UserDetail />} />
                    <Route path="/users/:id/edit" element={<UserEdit />} />
                    <Route path="/applications" element={<ApplicationList />} />
                    <Route path="/applications/create" element={<ApplicationCreate />} />
                    <Route path="/applications/:id" element={<ApplicationDetail />} />
                    <Route path="/services" element={<ServiceList />} />
                    <Route path="/services/create" element={<ServiceCreate />} />
                    <Route path="/services/:id" element={<ServiceDetail />} />
                    <Route path="/services/:id/edit" element={<ServiceEdit />} />
                    <Route path="/sessions" element={<SessionList />} />
                    <Route path="/settings" element={<SessionSettings />} />
                    <Route path="/admin/docs/theme" element={<DocsThemeEditor />} />
                    <Route path="/admin/docs/content" element={<DocsContentManager />} />
                    {/* Legacy paths redirect if still linked/bookmarked */}
                    <Route path="/docs/theme" element={<Navigate to="/admin/docs/theme" replace />} />
                    <Route path="/docs/content" element={<Navigate to="/admin/docs/content" replace />} />
                  </Route>
                  <Route path="/login" element={<Login />} />
                  <Route path="*" element={<ErrorComponent />} />
                </Routes>
                <RefineKbar />
              </Refine>
            )}
          </NotificationsProvider>
        </MantineProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
