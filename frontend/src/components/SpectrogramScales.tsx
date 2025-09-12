import React, { useMemo } from 'react';
import { LAYOUT_CONSTANTS } from '../utils/coordinates';
import { AXIS_STYLES, formatTimeLabel, formatFrequencyLabel, getTimeTickInterval } from '../utils/axisStyles';

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
  // Memoized time scale ticks generation for performance
  const timeTicks = useMemo(() => {
    const ticks = [];
    const totalWidth = (width - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH) * zoomLevel; // Account for frequency scale
    const visibleDuration = duration;
    
    // Use consistent interval calculation
    const interval = getTimeTickInterval(duration, zoomLevel);
    
    const numTicks = Math.ceil(visibleDuration / interval);
    
    for (let i = 0; i <= numTicks; i++) {
      const time = i * interval;
      if (time <= duration) {
        const position = (time / duration) * totalWidth - scrollOffset;
        
        // Only show ticks that are visible (with buffer)
        if (position >= -50 && position <= width - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH + 50) {
          ticks.push({
            position,
            label: formatTimeLabel(time),
            major: i % 5 === 0
          });
        }
      }
    }
    
    return ticks;
  }, [duration, zoomLevel, scrollOffset, width]);

  // Memoized frequency scale ticks generation for performance
  const frequencyTicks = useMemo(() => {
    const ticks = [];
    const spectrogramHeight = height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO; // Use consistent ratio
    
    // Generate ticks from 0 to maxFrequency
    const numTicks = 10;
    for (let i = 0; i <= numTicks; i++) {
      const freq = (i / numTicks) * maxFrequency;
      const position = spectrogramHeight - (i / numTicks) * spectrogramHeight; // Invert for display
      
      ticks.push({
        position,
        label: formatFrequencyLabel(freq),
        major: i % 2 === 0
      });
    }
    
    return ticks;
  }, [maxFrequency, height]);

  // Filter visible ticks for better performance
  const visibleTimeTicks = useMemo(() => 
    timeTicks.filter(tick => 
      tick.position >= -10 && 
      tick.position <= width - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH + 10
    ),
    [timeTicks, width]
  );

  return (
    <React.Fragment>

      {/* Frequency scale (vertical) - aligned with spectrogram */}
      <div 
        className="absolute left-0 bg-white border-r border-gray-300" 
        style={{ 
          top: '0', 
          height: `${LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO * 100}%`,
          width: `${LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH}px`
        }}
      >
        <svg width={LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH} height={height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO} className="absolute">
          {frequencyTicks.map((tick, index) => (
            <g key={index}>
              <line
                x1={32}
                y1={tick.position}
                x2={tick.major ? 30 : 35}
                y2={tick.position}
                stroke={tick.major ? AXIS_STYLES.TICK_MAJOR.stroke : AXIS_STYLES.TICK_MINOR.stroke}
                strokeWidth={tick.major ? AXIS_STYLES.TICK_MAJOR.strokeWidth : AXIS_STYLES.TICK_MINOR.strokeWidth}
              />
              {tick.major && (
                <text
                  x={28}
                  y={tick.position + 4}
                  textAnchor="end"
                  fontSize={AXIS_STYLES.TICK_LABEL.fontSize}
                  fill={AXIS_STYLES.TICK_LABEL.fill}
                  fontWeight={AXIS_STYLES.TICK_LABEL.fontWeight}
                >
                  {tick.label}
                </text>
              )}
            </g>
          ))}
          <text
            x={12}
            y={(height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO) / 2}
            textAnchor="middle"
            fontSize={AXIS_STYLES.AXIS_LABEL.fontSize}
            fill={AXIS_STYLES.AXIS_LABEL.fill}
            fontWeight={AXIS_STYLES.AXIS_LABEL.fontWeight}
            transform={`rotate(-90, 12, ${(height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO) / 2})`}
          >
            Frequency (Hz)
          </text>
        </svg>
      </div>

      {/* Grid lines - only for spectrogram area */}
      <svg 
        width={width - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH} 
        height={height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO} 
        className="absolute pointer-events-none"
        style={{ left: `${LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH}px`, top: '0' }}
      >
        {/* Horizontal grid lines (frequency) */}
        {frequencyTicks.filter(tick => tick.major).map((tick, index) => (
          <line
            key={`h-${index}`}
            x1={0}
            y1={tick.position}
            x2={width}
            y2={tick.position}
            stroke={AXIS_STYLES.GRID_LINE.stroke}
            strokeWidth={AXIS_STYLES.GRID_LINE.strokeWidth}
            strokeDasharray={AXIS_STYLES.GRID_LINE.strokeDasharray}
          />
        ))}
        
        {/* Vertical grid lines (time) - only visible and major ticks */}
        {visibleTimeTicks.filter(tick => tick.major).map((tick, index) => (
          <line
            key={`v-${index}`}
            x1={tick.position}
            y1={0}
            x2={tick.position}
            y2={height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO}
            stroke={AXIS_STYLES.GRID_LINE.stroke}
            strokeWidth={AXIS_STYLES.GRID_LINE.strokeWidth}
            strokeDasharray={AXIS_STYLES.GRID_LINE.strokeDasharray}
          />
        ))}
      </svg>
    </React.Fragment>
  );
};

export default SpectrogramScales;