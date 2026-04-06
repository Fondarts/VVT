import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { OnboardingStep } from '../hooks/useOnboarding';

interface OnboardingProps {
  step: OnboardingStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onAction?: (action: string) => void;
}

interface Rect { top: number; left: number; width: number; height: number }

export const Onboarding: React.FC<OnboardingProps> = ({ step, stepIndex, totalSteps, onNext, onPrev, onSkip, onAction }) => {
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const prevStepRef = useRef(step.id);
  const isCentered = !step.targetSelector;
  const isLast = stepIndex === totalSteps - 1;

  // Fire action when step changes
  useEffect(() => {
    if (step.id !== prevStepRef.current || stepIndex === 0) {
      prevStepRef.current = step.id;
      if (step.action && onAction) {
        onAction(step.action);
      }
    }
  }, [step.id, step.action, stepIndex, onAction]);

  const measure = useCallback(() => {
    if (!step.targetSelector) { setTargetRect(null); return; }
    const el = document.querySelector(step.targetSelector);
    if (!el) { setTargetRect(null); return false; }
    const r = el.getBoundingClientRect();
    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    return true;
  }, [step.targetSelector]);

  // Re-measure on step change, resize, scroll.
  // Retry up to several times if the target element isn't in the DOM yet
  // (e.g. video player appears after async fetch completes).
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 10;
    let retryTimer: ReturnType<typeof setTimeout>;

    const tryMeasure = () => {
      const found = measure();
      if (!found && step.targetSelector && retryCount < maxRetries) {
        retryCount++;
        retryTimer = setTimeout(tryMeasure, 400);
      }
    };

    // Initial delay for DOM to settle after action
    const timer = setTimeout(tryMeasure, 200);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(timer);
      clearTimeout(retryTimer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure, step.targetSelector]);

  const getPopoverStyle = (): React.CSSProperties => {
    if (isCentered || !targetRect) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }
    const pad = 16;
    const pos = step.position || 'bottom';
    const style: React.CSSProperties = { position: 'fixed' };

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popW = isCentered ? 440 : 360;
    const popH = 220; // approximate

    switch (pos) {
      case 'bottom':
        style.top = Math.min(targetRect.top + targetRect.height + pad, vh - popH - pad);
        style.left = Math.min(Math.max(popW / 2 + pad, targetRect.left + targetRect.width / 2), vw - popW / 2 - pad);
        style.transform = 'translateX(-50%)';
        break;
      case 'top':
        style.top = Math.max(pad + popH, targetRect.top - pad);
        style.left = Math.min(Math.max(popW / 2 + pad, targetRect.left + targetRect.width / 2), vw - popW / 2 - pad);
        style.transform = 'translate(-50%, -100%)';
        break;
      case 'left':
        style.top = Math.min(Math.max(pad, targetRect.top + targetRect.height / 2 - popH / 2), vh - popH - pad);
        style.left = Math.max(popW + pad, targetRect.left - pad);
        style.transform = 'translate(-100%, 0)';
        break;
      case 'right':
        style.top = Math.min(Math.max(pad, targetRect.top + targetRect.height / 2 - popH / 2), vh - popH - pad);
        style.left = Math.min(targetRect.left + targetRect.width + pad, vw - popW - pad);
        style.transform = 'translateY(0)';
        break;
    }
    return style;
  };

  // Render description with newline support
  const descLines = step.description.split('\n').filter(Boolean);
  const opacity = step.backdropOpacity ?? 0.7;

  return (
    <div className="onboarding-overlay" style={{ pointerEvents: 'auto' }}>
      {/* Backdrop */}
      {targetRect ? (
        <svg
          style={{ position: 'fixed', inset: 0, zIndex: 9990, pointerEvents: 'none' }}
          width="100%" height="100%"
        >
          <defs>
            <mask id="onboarding-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={targetRect.left - 6}
                y={targetRect.top - 6}
                width={targetRect.width + 12}
                height={targetRect.height + 12}
                rx="8"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%" height="100%"
            fill={`rgba(0,0,0,${opacity})`}
            mask="url(#onboarding-mask)"
          />
        </svg>
      ) : (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9990,
          background: `rgba(0,0,0,${opacity})`,
        }} />
      )}

      {/* Click catcher */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9991 }}
        onClick={e => { e.stopPropagation(); }}
      />

      {/* Popover */}
      <div
        className="onboarding-popover"
        style={{
          ...getPopoverStyle(),
          zIndex: 9992,
          width: isCentered ? 440 : 360,
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        {/* Close */}
        <button
          className="onboarding-close"
          onClick={onSkip}
          aria-label="Skip tour"
        >
          <X size={14} />
        </button>

        <h3 className="onboarding-title">{step.title}</h3>
        <div className="onboarding-desc">
          {descLines.map((line, i) => (
            <p key={i} style={{ margin: i < descLines.length - 1 ? '0 0 8px' : 0 }}>{line}</p>
          ))}
        </div>

        {/* Footer */}
        <div className="onboarding-footer">
          <span className="onboarding-progress">
            {stepIndex + 1} / {totalSteps}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {stepIndex > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={onPrev}>
                <ChevronLeft size={14} />
                Back
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={onNext}>
              {isLast ? 'Done' : <>Next <ChevronRight size={14} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
