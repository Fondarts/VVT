import React, { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, X, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export const useToast = () => useContext(ToastContext);

let idCounter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast-${++idCounter}`;
    setToasts(prev => [...prev, { id, message, type }]);
    const timer = setTimeout(() => removeToast(id), 4000);
    timersRef.current.set(id, timer);
  }, [removeToast]);

  useEffect(() => {
    return () => { timersRef.current.forEach(t => clearTimeout(t)); };
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
          display: 'flex', flexDirection: 'column', gap: '8px',
          pointerEvents: 'none',
        }}>
          {toasts.map(toast => (
            <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
};

const ICON: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} />,
  error: <AlertCircle size={16} style={{ color: 'var(--color-error)', flexShrink: 0 }} />,
  warning: <AlertTriangle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />,
  info: <Info size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />,
};

const BORDER_COLOR: Record<ToastType, string> = {
  success: 'var(--color-success)',
  error: 'var(--color-error)',
  warning: 'var(--color-warning)',
  info: 'var(--color-accent)',
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px',
        background: 'var(--color-bg-secondary)',
        border: `1px solid ${BORDER_COLOR[toast.type]}`,
        borderRadius: '8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        fontSize: '0.8125rem',
        color: 'var(--color-text-primary)',
        maxWidth: '360px',
        pointerEvents: 'auto',
        animation: 'toast-slide-in 0.2s ease-out',
      }}
    >
      {ICON[toast.type]}
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        style={{
          background: 'none', border: 'none', color: 'var(--color-text-muted)',
          cursor: 'pointer', padding: '2px', flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
};
