import { Box, Group, Image, Text } from '@mantine/core';
import { useLink } from '@refinedev/core';
import React from 'react';

export const CustomTitle: React.FC = () => {
  const Link = useLink();

  return (
    <Link to="/" style={{ textDecoration: 'none' }}>
      <Box
        style={{
          padding: '8px 0',
          borderBottom: '1px solid #e9ecef',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          position: 'relative',
          zIndex: 1,
          minHeight: '60px',
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.2s ease',
          borderRadius: '8px',
          marginBottom: '16px'
        }}
      >
        <Group spacing="sm" align="center" style={{ width: '100%' }}>
          <Image
            src="/assets/logo.jpg"
            alt="Gateway Logo"
            width={28}
            height={28}
            fit="contain"
            radius="md"
            style={{
              border: '2px solid rgba(255, 255, 255, 0.2)',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              flexShrink: 0
            }}
          />
          <Box
            className="title-text"
            style={{
              flex: 1,
              overflow: 'hidden'
            }}
          >
            <Text
              size="md"
              weight={700}
              color="white"
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                letterSpacing: '-0.025em',
                lineHeight: 1.2,
                whiteSpace: 'nowrap'
              }}
            >
              Gateway
            </Text>
            <Text
              size="xs"
              color="rgba(255, 255, 255, 0.8)"
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                letterSpacing: '0.025em',
                textTransform: 'uppercase',
                fontWeight: 500,
                whiteSpace: 'nowrap'
              }}
            >
              Admin Panel
            </Text>
          </Box>
        </Group>
      </Box>
    </Link>
  );
};
