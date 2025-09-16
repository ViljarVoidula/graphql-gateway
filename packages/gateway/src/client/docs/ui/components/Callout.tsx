import React from 'react';

export const Callout: React.FC<{ type?: 'info' | 'warn' | 'danger'; children: React.ReactNode }> = ({
  type = 'info',
  children
}) => {
  return <div className={`callout callout-${type}`}>{children}</div>;
};
