import { Global, MantineProvider } from '@mantine/core';
import { NotificationsProvider } from '@mantine/notifications';
import { Authenticated, Refine } from '@refinedev/core';
import { RefineKbar, RefineKbarProvider } from '@refinedev/kbar';
import { ErrorComponent, Layout, notificationProvider } from '@refinedev/mantine';
import routerProvider from '@refinedev/react-router-v6';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';

import { Dashboard } from './pages/dashboard';
import { Login } from './pages/login';
import { ServiceList } from './pages/services';
import { SessionList } from './pages/sessions';
import { UserList } from './pages/users';
import { authProvider } from './providers/auth';
import { dataProvider } from './providers/data';

function App() {
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
          <Global styles={{ body: { WebkitFontSmoothing: 'auto' } }} />
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
                    canDelete: true
                  }
                },
                {
                  name: 'services',
                  list: '/services',
                  show: '/services/:id',
                  create: '/services/create',
                  edit: '/services/:id/edit',
                  meta: {
                    canDelete: true
                  }
                },
                {
                  name: 'sessions',
                  list: '/sessions',
                  meta: {
                    canDelete: true
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
                      <Layout>
                        <Outlet />
                      </Layout>
                    </Authenticated>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="/users" element={<UserList />} />
                  <Route path="/services" element={<ServiceList />} />
                  <Route path="/sessions" element={<SessionList />} />
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
