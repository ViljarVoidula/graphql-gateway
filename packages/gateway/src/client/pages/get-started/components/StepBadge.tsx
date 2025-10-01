import { Badge } from '@mantine/core';
import { FC } from 'react';

interface StepBadgeProps {
  label: string;
}

export const StepBadge: FC<StepBadgeProps> = ({ label }) => (
  <Badge color="blue" radius="sm" size="sm">
    {label}
  </Badge>
);

export default StepBadge;
