import React, { useEffect, useRef } from 'react';

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
      const adjustedX = Math.min(x, window.innerWidth - rect.width - 10);
      const adjustedY = Math.min(y, window.innerHeight - rect.height - 10);
      
      menuRef.current.style.left = `${Math.max(10, adjustedX)}px`;
      menuRef.current.style.top = `${Math.max(10, adjustedY)}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px]"
      style={{ left: x, top: y }}
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