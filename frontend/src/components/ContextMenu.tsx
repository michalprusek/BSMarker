import React, { useEffect, useRef, useState } from 'react';

interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  shortcut?: string;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState({ x, y });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position if menu would go off screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const menuHeight = rect.height;
      const menuWidth = rect.width;
      
      // Calculate adjusted position to keep menu fully visible
      let adjustedX = x;
      let adjustedY = y;
      
      // Check right edge
      if (x + menuWidth > window.innerWidth - 10) {
        adjustedX = window.innerWidth - menuWidth - 10;
      }
      
      // Check bottom edge - this is the main fix for the cutoff issue
      if (y + menuHeight > window.innerHeight - 10) {
        adjustedY = window.innerHeight - menuHeight - 10;
      }
      
      // Ensure minimum distance from edges
      adjustedX = Math.max(10, adjustedX);
      adjustedY = Math.max(10, adjustedY);
      
      setAdjustedPosition({ x: adjustedX, y: adjustedY });
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px] max-h-[80vh] overflow-y-auto"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={() => {
            if (!item.disabled) {
              item.onClick();
              onClose();
            }
          }}
          disabled={item.disabled}
          className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-gray-100 transition-colors ${
            item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <div className="flex items-center space-x-2">
            {item.icon && <span className="w-4 h-4">{item.icon}</span>}
            <span className="text-sm text-gray-700">{item.label}</span>
          </div>
          {item.shortcut && (
            <span className="text-xs text-gray-400 ml-4">{item.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  );
};

export default ContextMenu;