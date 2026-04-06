import React, { useCallback } from 'react';
import { Onboarding } from './components/Onboarding';
import { useOnboarding } from './hooks/useOnboarding';

/**
 * Standalone host for the Onboarding tour.
 * Rendered in its own React root (#onboarding-root) so it is completely
 * isolated from the main App component tree and its re-renders.
 *
 * Communicates with App via the module-level onboarding store
 * and the global onboardingActions dispatcher.
 */
export const OnboardingHost: React.FC = () => {
  const ob = useOnboarding();

  const handleAction = useCallback((action: string) => {
    // Dispatch to the App via the global handler
    if (window.__kissdOnboardingAction) {
      window.__kissdOnboardingAction(action);
    }
  }, []);

  if (!ob.active || !ob.currentStep) return null;

  return (
    <Onboarding
      step={ob.currentStep}
      stepIndex={ob.step}
      totalSteps={ob.totalSteps}
      onNext={ob.next}
      onPrev={ob.prev}
      onSkip={ob.skip}
      onAction={handleAction}
    />
  );
};

// Type augmentation for the global action bridge
declare global {
  interface Window {
    __kissdOnboardingAction?: (action: string) => void;
  }
}
