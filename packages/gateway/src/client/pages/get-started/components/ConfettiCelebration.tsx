import { keyframes } from '@emotion/react';
import { Box } from '@mantine/core';
import { FC, useEffect, useMemo, useState } from 'react';

const createFallAnimation = (sway: number, rotation: number) =>
  keyframes`
    0% {
      transform: translate3d(0, -120vh, 0) rotate(0deg);
      opacity: 0;
    }
    20% {
      opacity: 1;
    }
    60% {
      transform: translate3d(${(sway / 2).toFixed(2)}vw, 40vh, 0) rotate(${(rotation / 2).toFixed(0)}deg);
    }
    100% {
      transform: translate3d(${sway.toFixed(2)}vw, 120vh, 0) rotate(${rotation.toFixed(0)}deg);
      opacity: 0;
    }
  `;

export interface ConfettiCelebrationProps {
  seed: number;
  duration?: number;
}

export const ConfettiCelebration: FC<ConfettiCelebrationProps> = ({ seed, duration = 4500 }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), duration);
    return () => window.clearTimeout(timer);
  }, [duration, seed]);

  const pieces = useMemo(() => {
    const colors = ['#3b82f6', '#22c55e', '#ef4444', '#f97316', '#a855f7', '#14b8a6', '#facc15'];
    return Array.from({ length: 140 }).map((_, index) => {
      const width = 6 + Math.random() * 8;
      const height = 10 + Math.random() * 10;
      const sway = -6 + Math.random() * 12;
      const rotation = 360 + Math.random() * 720;
      const durationSeconds = 2.6 + Math.random() * 1.6;
      const delaySeconds = Math.random() * 0.8;
      const fall = createFallAnimation(sway, rotation);
      return {
        id: `${seed}-${index}`,
        color: colors[index % colors.length],
        left: Math.random() * 100,
        width,
        height,
        borderRadius: height > 16 ? '2px' : '50%',
        animation: `${fall} ${durationSeconds.toFixed(2)}s ease-out ${delaySeconds.toFixed(2)}s forwards`
      };
    });
  }, [seed]);

  if (!visible) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1000,
        overflow: 'hidden'
      }}
    >
      {pieces.map((piece) => (
        <Box
          key={piece.id}
          sx={{
            position: 'absolute',
            top: 0,
            left: `${piece.left}%`,
            width: piece.width,
            height: piece.height,
            borderRadius: piece.borderRadius,
            backgroundColor: piece.color,
            opacity: 0,
            animation: piece.animation
          }}
        />
      ))}
    </Box>
  );
};

export default ConfettiCelebration;
