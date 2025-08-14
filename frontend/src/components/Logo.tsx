import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 48 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer circle */}
      <circle
        cx="100"
        cy="100"
        r="90"
        fill="none"
        stroke="#1E90FF"
        strokeWidth="20"
      />
      
      {/* Bird shape with waveform */}
      <g>
        {/* Bird body and head */}
        <path
          d="M 60 100
             C 60 70, 80 50, 110 50
             C 130 50, 145 60, 150 75
             L 160 70
             C 165 68, 170 70, 170 75
             C 170 80, 165 82, 160 82
             L 152 85
             C 155 95, 155 110, 145 125
             C 135 140, 115 150, 95 150
             C 65 150, 50 125, 50 100
             Q 40 90, 40 100
             Q 40 110, 50 115
             Z"
          fill="#1E90FF"
        />
        
        {/* Waveform through bird */}
        <path
          d="M 30 100 
             L 50 100
             L 60 85
             L 70 115
             L 80 75
             L 90 125
             L 100 85
             L 110 115
             L 120 100
             L 130 100
             L 140 85
             L 150 115
             L 160 100
             L 170 100"
          fill="none"
          stroke="white"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
};

export default Logo;