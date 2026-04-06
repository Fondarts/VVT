import React from 'react';
import { Plus, Pencil, X } from 'lucide-react';
import { validationPresets } from '../shared/presets';
import { RULE_DEFS } from '../shared/presetRules';
import { RuleRow } from './RuleRow';
import type { UseCustomPresetsReturn } from '../hooks/useCustomPresets';

interface Props {
  presets: UseCustomPresetsReturn;
}

export const CustomPresetModal: React.FC<Props> = ({ presets }) => {
  const {
    showCustomModal, setShowCustomModal,
    editingPresetId, setEditingPresetId,
    customForm, setCustomForm,
    overwriteTarget, setOverwriteTarget,
    saveCustomPreset, doSave, updateRule, presetToRules,
  } = presets;

  if (!showCustomModal) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={e => { if (e.target === e.currentTarget) { setShowCustomModal(false); setEditingPresetId(null); } }}
    >
      <div
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          width: '780px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {editingPresetId ? <Pencil size={15} style={{ color: 'var(--color-accent)' }} /> : <Plus size={15} style={{ color: 'var(--color-accent)' }} />}
            <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>
              {editingPresetId ? 'Edit Preset' : 'Add Custom Preset'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {editingPresetId && validationPresets.some(p => p.id === editingPresetId) && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                title="Reset to built-in defaults"
                onClick={() => {
                  const builtin = validationPresets.find(p => p.id === editingPresetId)!;
                  setCustomForm({ name: builtin.name, rules: presetToRules(builtin) });
                }}
              >
                Reset defaults
              </button>
            )}
            <button className="btn btn-icon btn-sm" onClick={() => { setShowCustomModal(false); setEditingPresetId(null); }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Preset name */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <input
            className="input"
            type="text"
            placeholder="Preset name (required)"
            value={customForm.name}
            onChange={e => setCustomForm(prev => ({ ...prev, name: e.target.value }))}
            style={{ width: '100%', fontSize: '0.875rem' }}
            autoFocus
          />
        </div>

        {/* Column headers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0, background: 'var(--color-bg-primary)' }}>
          <div style={{ width: '24px', flexShrink: 0 }} />
          <div style={{ width: '196px', flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>Parameter</div>
          <div style={{ width: '148px', flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>Condition</div>
          <div style={{ flex: 1, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>Value</div>
        </div>

        {/* Rules list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {(['File', 'Video', 'Audio'] as const).map(cat => (
            <div key={cat}>
              <div style={{
                padding: '6px 20px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--color-text-muted)',
                background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--color-border)',
                position: 'sticky', top: 0, zIndex: 1,
              }}>
                {cat}
              </div>
              {RULE_DEFS.filter(d => d.category === cat).map(def => (
                <RuleRow
                  key={def.id}
                  def={def}
                  state={customForm.rules[def.id]}
                  onChange={s => updateRule(def.id, s)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
          {overwriteTarget ? (
            <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px', background: editingPresetId === overwriteTarget.id ? 'rgba(var(--color-accent-rgb,59,130,246),0.08)' : 'rgba(var(--color-warning-rgb,255,165,0),0.08)' }}>
              <span style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                {editingPresetId === overwriteTarget.id ? (
                  <>Save changes to <strong>"{overwriteTarget.name}"</strong>?</>
                ) : (
                  <><span style={{ color: 'var(--color-warning)' }}>⚠</span>{' '}Preset <strong>"{overwriteTarget.name}"</strong> already exists. Overwrite it?</>
                )}
              </span>
              <button className="btn btn-secondary" onClick={() => setOverwriteTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={editingPresetId !== overwriteTarget.id ? { background: 'var(--color-warning)', borderColor: 'var(--color-warning)' } : {}}
                onClick={() => doSave(overwriteTarget.id)}
              >
                {editingPresetId === overwriteTarget.id ? 'Save Changes' : 'Overwrite'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '14px 20px' }}>
              <button className="btn btn-secondary" onClick={() => { setShowCustomModal(false); setEditingPresetId(null); setOverwriteTarget(null); }}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveCustomPreset}
                disabled={!customForm.name.trim()}
              >
                {editingPresetId ? 'Save Changes' : 'Save Preset'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
