import React from 'react';

export type BadgeStatus = 'finished' | 'annotated';

interface StatusBadgeProps {
  status: BadgeStatus;
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const config = {
    finished: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Finished',
    },
    annotated: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      label: 'Annotated',
    },
  };

  const { bg, text, label } = config[status];

  return (
    <span
      className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${bg} ${text} ${className}`}
    >
      {label}
    </span>
  );
};

export default StatusBadge;
