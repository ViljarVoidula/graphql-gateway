import React from 'react';
import { AppShell, Navbar, Header, Title, Text, Group, Button } from '@mantine/core';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLogout } from '@refinedev/core';
import { IconLogout } from '@tabler/icons-react';

export const BasicLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mutate: logout } = useLogout();

  const navItems = [
    { label: 'Dashboard', path: '/' },
    { label: 'Users', path: '/users' },
    { label: 'Services', path: '/services' },
    { label: 'Sessions', path: '/sessions' },
  ];

  return (
    <AppShell
      padding="md"
      navbar={
        <Navbar width={{ base: 250 }} p="md">
          <Navbar.Section>
            <Title order={4} mb="md">GraphQL Gateway</Title>
          </Navbar.Section>
          <Navbar.Section grow>
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={location.pathname === item.path ? 'filled' : 'subtle'}
                fullWidth
                leftIcon={null}
                onClick={() => navigate(item.path)}
                mb="xs"
              >
                {item.label}
              </Button>
            ))}
          </Navbar.Section>
        </Navbar>
      }
      header={
        <Header height={60} p="md">
          <Group position="apart">
            <Title order={3}>Admin Panel</Title>
            <Group>
              <Button
                variant="outline"
                onClick={() => window.open('/graphql', '_blank')}
              >
                GraphQL
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open('/health', '_blank')}
              >
                Health
              </Button>
              <Button
                variant="outline"
                color="red"
                leftIcon={<IconLogout size={16} />}
                onClick={() => logout()}
              >
                Logout
              </Button>
            </Group>
          </Group>
        </Header>
      }
    >
      {children}
    </AppShell>
  );
};
