import { Tooltip } from '@mantine/core';
import React from 'react';

interface MiniBarsProps {
  data: Array<{
    requestCount: number;
    errorCount?: number;
    rateLimitExceededCount?: number;
    date?: string;
  }>;
  height?: number;
  width?: number;
  showTooltips?: boolean;
}

export const MiniBars: React.FC<MiniBarsProps> = ({ data, height = 28, width = 120, showTooltips = true }) => {
  const max = Math.max(1, ...data.map((d) => (d.requestCount || 0) + (d.errorCount || 0) + (d.rateLimitExceededCount || 0)));
  const barWidth = Math.max(2, Math.floor(width / Math.max(1, data.length)) - 1);

  const bars = data.map((d, i) => {
    const successCount = d.requestCount || 0;
    const errorCount = d.errorCount || 0;
    const rateLimitCount = d.rateLimitExceededCount || 0;
    const total = successCount + errorCount + rateLimitCount;

    const totalHeight = Math.round((total / max) * (height - 2));
    const rateLimitHeight = rateLimitCount > 0 ? Math.max(1, Math.round((rateLimitCount / max) * (height - 2))) : 0;
    const errorHeight = errorCount > 0 ? Math.max(1, Math.round((errorCount / max) * (height - 2))) : 0;
    const successHeight = totalHeight - errorHeight - rateLimitHeight;

    const x = i * (barWidth + 1);
    const ySuccess = height - totalHeight;
    const yError = ySuccess + successHeight;
    const yRateLimit = yError + errorHeight;

    const barElement = (
      <g key={i}>
        {/* Success requests */}
        {successHeight > 0 && <rect x={x} y={ySuccess} width={barWidth} height={successHeight} fill="#51cf66" rx={1} ry={1} />}
        {/* Error requests */}
        {errorHeight > 0 && <rect x={x} y={yError} width={barWidth} height={errorHeight} fill="#ff6b6b" rx={1} ry={1} />}
        {/* Rate limited requests */}
        {rateLimitHeight > 0 && (
          <rect x={x} y={yRateLimit} width={barWidth} height={rateLimitHeight} fill="#ffd43b" rx={1} ry={1} />
        )}
      </g>
    );

    if (showTooltips && d.date) {
      const date = new Date(d.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
      const tooltipParts = [
        `${date}:`,
        `${successCount} successful`,
        errorCount > 0 ? `${errorCount} errors` : null,
        rateLimitCount > 0 ? `${rateLimitCount} rate limited` : null
      ].filter(Boolean);
      const tooltipLabel = tooltipParts.join(', ');

      return (
        <Tooltip key={i} label={tooltipLabel} position="top" withArrow>
          {barElement}
        </Tooltip>
      );
    }

    return barElement;
  });

  return (
    <svg width={width} height={height} aria-label="usage-sparkline">
      {bars}
    </svg>
  );
};
