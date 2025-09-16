import React, { PropsWithChildren } from 'react';

interface SchemaLinkProps {
  type: string;
}

export const SchemaLink: React.FC<PropsWithChildren<SchemaLinkProps>> = ({ type, children }) => {
  const href = `#/schema/${type}`;
  return (
    <a href={href} className="schema-link">
      {children || type}
    </a>
  );
};
