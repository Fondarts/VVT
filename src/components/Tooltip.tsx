import React, { useState, useRef, useCallback, useEffect } from 'react';

interface TooltipProps {
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, position = 'top', delay = 500, children }) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const gap = 8;
      let x: number, y: number;
      switch (position) {
        case 'bottom':
          x = rect.left + rect.width / 2;
          y = rect.bottom + gap;
          break;
        case 'left':
          x = rect.left - gap;
          y = rect.top + rect.height / 2;
          break;
        case 'right':
          x = rect.right + gap;
          y = rect.top + rect.height / 2;
          break;
        default: // top
          x = rect.left + rect.width / 2;
          y = rect.top - gap;
      }
      setCoords({ x, y });
      setVisible(true);
    }, delay);
  }, [position, delay]);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const transformMap: Record<string, string> = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
  };

  return (
    <span
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={hide}
      style={{ display: 'inline-flex', alignItems: 'center' }}
    >
      {children}
      {visible && (
        <div
          className="kissd-tooltip"
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
            transform: transformMap[position],
            zIndex: 10000,
            pointerEvents: 'none',
          }}
          data-position={position}
        >
          {content}
        </div>
      )}
    </span>
  );
};
