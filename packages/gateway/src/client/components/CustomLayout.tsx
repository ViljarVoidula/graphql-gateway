import {
  ActionIcon,
  AppShell,
  Box,
  Button,
  Divider,
  Group,
  Header,
  Navbar,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  useMantineTheme
} from '@mantine/core';
import { useLogout } from '@refinedev/core';
import {
  IconAdjustments,
  IconApps,
  IconChevronLeft,
  IconChevronRight,
  IconDashboard,
  IconFingerprint,
  IconLogout,
  IconServer,
  IconUserCircle
} from '@tabler/icons-react';
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CustomTitle } from './CustomTitle';
import { SessionStatus } from './SessionStatus';

interface CustomLayoutProps {
  children: React.ReactNode;
}

const menuItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: IconDashboard,
    path: '/'
  },
  {
    id: 'users',
    label: 'Users',
    icon: IconUserCircle,
    path: '/users'
  },
  {
    id: 'applications',
    label: 'Applications',
    icon: IconApps,
    path: '/applications'
  },
  {
    id: 'services',
    label: 'Services',
    icon: IconServer,
    path: '/services'
  },
  {
    id: 'sessions',
    label: 'Sessions',
    icon: IconFingerprint,
    path: '/sessions'
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: IconAdjustments,
    path: '/settings'
  }
];

export const CustomLayout: React.FC<CustomLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { mutate: logout } = useLogout();
  const theme = useMantineTheme();

  const handleLogout = () => {
    logout();
  };

  const toggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <AppShell
      navbar={
        <Navbar
          p="md"
          width={{ base: collapsed ? 80 : 280 }}
          style={{
            transition: 'width 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            height: '100vh'
          }}
        >
          {/* Header section */}
          <Navbar.Section>
            {!collapsed && <CustomTitle />}
            {collapsed && (
              <Box
                style={{
                  padding: '8px 0',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'center'
                }}
              >
                <IconDashboard size={32} color={theme.colors.blue[6]} />
              </Box>
            )}
          </Navbar.Section>

          {/* Navigation items */}
          <Navbar.Section grow mt="md" component={ScrollArea}>
            <Stack spacing="xs">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);

                return (
                  <Tooltip key={item.id} label={item.label} position="right" disabled={!collapsed}>
                    <UnstyledButton
                      onClick={() => navigate(item.path)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        backgroundColor: active ? theme.colors.blue[0] : 'transparent',
                        color: active ? theme.colors.blue[7] : theme.colors.gray[7],
                        transition: 'all 0.2s ease',
                        cursor: 'pointer',
                        justifyContent: collapsed ? 'center' : 'flex-start'
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.backgroundColor = theme.colors.gray[0];
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <Group spacing="sm" noWrap>
                        <Icon size={20} />
                        {!collapsed && (
                          <Text size="sm" weight={500}>
                            {item.label}
                          </Text>
                        )}
                      </Group>
                    </UnstyledButton>
                  </Tooltip>
                );
              })}
            </Stack>
          </Navbar.Section>

          {/* Session Status */}
          {!collapsed && (
            <Navbar.Section mt="md">
              <Box
                style={{
                  padding: '8px',
                  backgroundColor: theme.colors.gray[0],
                  borderRadius: '8px',
                  border: `1px solid ${theme.colors.gray[2]}`
                }}
              >
                <SessionStatus />
              </Box>
            </Navbar.Section>
          )}

          {/* Bottom section with collapse and logout */}
          <Navbar.Section>
            <Divider my="md" />
            <Stack spacing="sm">
              {/* Collapse button */}
              <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} position="right" disabled={!collapsed}>
                <ActionIcon
                  onClick={toggleCollapse}
                  variant="light"
                  size="lg"
                  color="blue"
                  style={{
                    width: '100%',
                    height: '40px',
                    borderRadius: '8px'
                  }}
                >
                  {collapsed ? <IconChevronRight size={20} /> : <IconChevronLeft size={20} />}
                </ActionIcon>
              </Tooltip>

              {/* Logout button */}
              <Tooltip label="Logout" position="right" disabled={!collapsed}>
                <Button
                  variant="light"
                  color="red"
                  onClick={handleLogout}
                  leftIcon={collapsed ? undefined : <IconLogout size={16} />}
                  style={{
                    width: '100%',
                    height: '40px',
                    borderRadius: '8px',
                    justifyContent: 'center'
                  }}
                >
                  {collapsed ? <IconLogout size={16} /> : 'Logout'}
                </Button>
              </Tooltip>
            </Stack>
          </Navbar.Section>
        </Navbar>
      }
      header={
        <Header height={0} style={{ display: 'none' }}>
          <div />
        </Header>
      }
      styles={(theme) => ({
        main: {
          backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0],
          paddingTop: 0
        }
      })}
    >
      <Box p="md">{children}</Box>
    </AppShell>
  );
};
