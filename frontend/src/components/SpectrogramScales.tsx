import React from 'react';

interface SpectrogramScalesProps {
  width: number;
  height: number;
  duration: number;
  maxFrequency: number;
  zoomLevel: number;
  scrollOffset: number;
}

const SpectrogramScales: React.FC<SpectrogramScalesProps> = ({
  width,
  height,
  duration,
  maxFrequency,
  zoomLevel,
  scrollOffset = 0
}) => {
  // Generate time scale ticks
  const generateTimeTicks = () => {
    const ticks = [];
    const totalWidth = (width - 40) * zoomLevel; // Account for frequency scale
    const visibleDuration = duration;
    
    // Determine appropriate interval based on zoom level
    let interval = 1; // seconds
    if (zoomLevel > 4) interval = 0.5;
    if (zoomLevel > 8) interval = 0.25;
    if (duration > 60) interval = 10;
    if (duration > 300) interval = 30;
    if (duration > 600) interval = 60;
    
    const numTicks = Math.ceil(visibleDuration / interval);
    
    for (let i = 0; i <= numTicks; i++) {
      const time = i * interval;
      if (time <= duration) {
        const position = (time / duration) * totalWidth - scrollOffset;
        
        // Only show ticks that are visible
        if (position >= 0 && position <= width - 40) {
          ticks.push({
            position,
            label: formatTime(time),
            major: i % 5 === 0
          });
        }
      }
    }
    
    return ticks;
  };

  // Generate frequency scale ticks
  const generateFrequencyTicks = () => {
    const ticks = [];
    const spectrogramHeight = height * 0.75; // 75% height for spectrogram
    
    // Generate ticks from 0 to maxFrequency
    const numTicks = 10;
    for (let i = 0; i <= numTicks; i++) {
      const freq = (i / numTicks) * maxFrequency;
      const position = spectrogramHeight - (i / numTicks) * spectrogramHeight; // Invert for display
      
      ticks.push({
        position,
        label: freq >= 1000 ? `${(freq / 1000).toFixed(0)}k` : `${freq.toFixed(0)}`,
        major: i % 2 === 0
      });
    }
    
    return ticks;
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toFixed(0).padStart(2, '0')}`;
    }
    return `${secs.toFixed(1)}s`;
  };

  const timeTicks = generateTimeTicks();
  const frequencyTicks = generateFrequencyTicks();

  return (
    <React.Fragment>
      {/* Time scale is now rendered in main component between spectrogram and waveform */}
      <svg width={width} height={32} className="absolute">
        {timeTicks.map((tick, index) => (
          <g key={index}>
            <line
              x1={tick.position}
              y1={0}
              x2={tick.position}
              y2={tick.major ? 8 : 5}
              stroke="#999"
              strokeWidth={tick.major ? 1.5 : 1}
            />
            {tick.major && (
              <text
                x={tick.position}
                y={20}
                textAnchor="middle"
                fontSize="11"
                fill="#666"
              >
                {tick.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Frequency scale (vertical) - aligned with spectrogram */}
      <div className="absolute left-0 w-10 bg-white border-r border-gray-300" style={{ top: '0', height: '75%' }}>
        <svg width={40} height={height * 0.75} className="absolute">
          {frequencyTicks.map((tick, index) => (
            <g key={index}>
              <line
                x1={32}
                y1={tick.position}
                x2={tick.major ? 32 : 35}
                y2={tick.position}
                stroke="#999"
                strokeWidth={tick.major ? 1.5 : 1}
              />
              {tick.major && (
                <text
                  x={28}
                  y={tick.position + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#666"
                >
                  {tick.label}
                </text>
              )}
            </g>
          ))}
          <text
            x={12}
            y={(height * 0.75) / 2}
            textAnchor="middle"
            fontSize="11"
            fill="#666"
            transform={`rotate(-90, 12, ${(height * 0.75) / 2})`}
          >
            Frequency (Hz)
          </text>
        </svg>
      </div>

      {/* Grid lines - only for spectrogram area */}
      <svg 
        width={width - 40} 
        height={height * 0.75} 
        className="absolute pointer-events-none"
        style={{ left: '40px', top: '0' }}
      >
        {/* Horizontal grid lines (frequency) */}
        {frequencyTicks.filter(tick => tick.major).map((tick, index) => (
          <line
            key={`h-${index}`}
            x1={0}
            y1={tick.position}
            x2={width}
            y2={tick.position}
            stroke="#e5e7eb"
            strokeWidth={0.5}
            strokeDasharray="2,2"
          />
        ))}
        
        {/* Vertical grid lines (time) */}
        {timeTicks.filter(tick => tick.major).map((tick, index) => (
          <line
            key={`v-${index}`}
            x1={tick.position}
            y1={0}
            x2={tick.position}
            y2={height * 0.75}
            stroke="#e5e7eb"
            strokeWidth={0.5}
            strokeDasharray="2,2"
          />
        ))}
      </svg>
    </React.Fragment>
  );
};

export default SpectrogramScales;