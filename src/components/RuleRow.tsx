import React from 'react';
import type { RuleDef, RuleState, ConditionId } from '../shared/presetRules';
import { CONDITION_LABELS, DEFAULT_CONDITIONS } from '../shared/presetRules';

interface Props {
  def: RuleDef;
  state: RuleState;
  onChange: (s: RuleState) => void;
}

export const RuleRow: React.FC<Props> = ({ def, state, onChange }) => {
  const [chipOpen, setChipOpen] = React.useState(false);
  const chipRef = React.useRef<HTMLDivElement>(null);
  const enabled = state.condition !== 'ignore';

  React.useEffect(() => {
    if (!chipOpen) return;
    const handler = (e: MouseEvent) => {
      if (chipRef.current && !chipRef.current.contains(e.target as Node)) setChipOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [chipOpen]);

  const toggleChip = (chip: string) => {
    if (state.condition === 'inList') {
      const current = state.value.split(',').map(s => s.trim()).filter(Boolean);
      const idx = current.findIndex(s => s.toLowerCase() === chip.toLowerCase());
      const updated = idx >= 0 ? current.filter((_, i) => i !== idx) : [...current, chip];
      onChange({ ...state, value: updated.join(', ') });
    } else {
      onChange({ ...state, value: chip });
      setChipOpen(false);
    }
  };

  const isChipActive = (chip: string) =>
    state.condition === 'inList'
      ? state.value.split(',').map(s => s.trim().toLowerCase()).includes(chip.toLowerCase())
      : state.value.toLowerCase() === chip.toLowerCase();

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
    borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '0.78rem',
    padding: '3px 6px', minWidth: 0,
  };

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '5px 20px', minHeight: '36px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: enabled ? 'rgba(59,130,246,0.06)' : 'transparent',
        cursor: enabled ? 'default' : 'pointer',
      }}
      onClick={!enabled ? () => onChange({ ...state, condition: def.dc }) : undefined}
    >
      <input
        type="checkbox"
        checked={enabled}
        onChange={e => onChange({ ...state, condition: e.target.checked ? def.dc : 'ignore' })}
        onClick={e => e.stopPropagation()}
        style={{ cursor: 'pointer', flexShrink: 0, accentColor: '#E1FF1C', width: '14px', height: '14px' }}
      />
      <span style={{ width: '196px', flexShrink: 0, fontSize: '0.8125rem', color: enabled ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
        {def.label}
      </span>
      {enabled ? (
        <>
          <select
            value={state.condition}
            onChange={e => onChange({ ...state, condition: e.target.value })}
            style={{ ...inputStyle, width: '148px', flexShrink: 0 }}
          >
            {(def.conditions ?? DEFAULT_CONDITIONS).map((c: ConditionId) => (
              <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
            ))}
          </select>
          <div ref={chipRef} style={{ position: 'relative', flex: 1, display: 'flex', gap: '4px', minWidth: 0 }}>
            <input
              type="text"
              value={state.value}
              onChange={e => onChange({ ...state, value: e.target.value })}
              placeholder={state.condition === 'inList' ? 'value1, value2…' : 'value'}
              style={{ ...inputStyle, flex: 1, width: '100%' }}
            />
            {def.chips && (
              <>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setChipOpen(o => !o); }}
                  style={{ ...inputStyle, flexShrink: 0, padding: '3px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  title="Quick pick"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  </svg>
                </button>
                {chipOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                    background: 'var(--color-bg-primary)', border: '1px solid var(--border-color)',
                    borderRadius: '8px', padding: '8px', zIndex: 600,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    display: 'flex', flexWrap: 'wrap', gap: '5px', minWidth: '180px',
                  }}>
                    {def.chips.map(chip => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => toggleChip(chip)}
                        style={{
                          padding: '3px 10px', borderRadius: '14px', fontSize: '0.75rem',
                          cursor: 'pointer', border: '1px solid', whiteSpace: 'nowrap',
                          background: isChipActive(chip) ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                          borderColor: isChipActive(chip) ? 'var(--color-accent)' : 'var(--border-color)',
                          color: isChipActive(chip) ? '#fff' : 'var(--color-text-primary)',
                          fontWeight: isChipActive(chip) ? 600 : 400,
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          {def.unit && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem', flexShrink: 0, width: '36px', textAlign: 'left' }}>
              {def.unit}
            </span>
          )}
        </>
      ) : (
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          click to enable
        </span>
      )}
    </div>
  );
};
