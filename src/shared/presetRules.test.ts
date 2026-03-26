import { describe, it, expect } from 'vitest';
import { RULE_DEFS, makeDefaultRules, defaultForm } from './presetRules';

describe('presetRules', () => {
  it('RULE_DEFS has entries for all categories', () => {
    const categories = new Set(RULE_DEFS.map(d => d.category));
    expect(categories).toContain('File');
    expect(categories).toContain('Video');
    expect(categories).toContain('Audio');
  });

  it('RULE_DEFS has unique ids', () => {
    const ids = RULE_DEFS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('makeDefaultRules creates entry for every rule', () => {
    const rules = makeDefaultRules();
    for (const def of RULE_DEFS) {
      expect(rules[def.id]).toBeDefined();
      expect(rules[def.id].condition).toBe('ignore');
      expect(rules[def.id].value).toBe(def.dv);
    }
  });

  it('defaultForm has empty name and default rules', () => {
    expect(defaultForm.name).toBe('');
    expect(Object.keys(defaultForm.rules).length).toBe(RULE_DEFS.length);
  });
});
