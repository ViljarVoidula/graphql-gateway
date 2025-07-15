import { Global, MantineProvider } from '@mantine/core';
import { NotificationsProvider } from '@mantine/notifications';
import { Authenticated, Refine } from '@refinedev/core';
import { RefineKbar, RefineKbarProvider } from '@refinedev/kbar';
import { ErrorComponent, notificationProvider } from '@refinedev/mantine';
import routerProvider from '@refinedev/react-router-v6';
import { IconAdjustments, IconFingerprint, IconServer, IconUserCircle } from '@tabler/icons-react';
import { useEffect } from 'react';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';

import { CustomLayout } from './components/CustomLayout';
import { Dashboard } from './pages/dashboard';
import { Login } from './pages/login';
import { ServiceList } from './pages/services';
import { ServiceCreate } from './pages/services/create';
import { ServiceEdit } from './pages/services/edit';
import { ServiceDetail } from './pages/services/detail';
import { SessionList } from './pages/sessions';
import { SessionSettings } from './pages/settings';
import { UserList } from './pages/users';
import { authProvider } from './providers/auth';
import { dataProvider } from './providers/data';
import { setupTokenRefreshTimer } from './utils/auth';

function App() {
  useEffect(() => {
    // Setup automatic token refresh timer
    const cleanup = setupTokenRefreshTimer();

    // Cleanup on unmount
    return cleanup;
  }, []);

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
                  <Route path="/services" element={<ServiceList />} />
                  <Route path="/services/create" element={<ServiceCreate />} />
                  <Route path="/services/:id" element={<ServiceDetail />} />
                  <Route path="/services/:id/edit" element={<ServiceEdit />} />
                  <Route path="/sessions" element={<SessionList />} />
                  <Route path="/settings" element={<SessionSettings />} />
                </Route>
                <Route path="/login" element={<Login />} />
                <Route path="*" element={<ErrorComponent />} />
              </Routes>
              <RefineKbar />
            </Refine>
          </NotificationsProvider>
        </MantineProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
