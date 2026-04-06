import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomPresetModal } from './CustomPresetModal';
import type { UseCustomPresetsReturn } from '../hooks/useCustomPresets';
import { makeDefaultRules } from '../shared/presetRules';

function makePresets(overrides: Partial<UseCustomPresetsReturn> = {}): UseCustomPresetsReturn {
  return {
    customPresets: [],
    allPresets: [],
    selectedPreset: '',
    setSelectedPreset: vi.fn(),
    showCustomModal: true,
    setShowCustomModal: vi.fn(),
    customForm: { name: '', rules: makeDefaultRules() },
    setCustomForm: vi.fn(),
    editingPresetId: null,
    setEditingPresetId: vi.fn(),
    overwriteTarget: null,
    setOverwriteTarget: vi.fn(),
    handlePresetChange: vi.fn(),
    saveCustomPreset: vi.fn(),
    doSave: vi.fn(),
    deleteCustomPreset: vi.fn(),
    openEditPreset: vi.fn(),
    updateRule: vi.fn(),
    presetToRules: vi.fn().mockReturnValue({}),
    ...overrides,
  };
}

describe('CustomPresetModal', () => {
  it('renders nothing when showCustomModal is false', () => {
    const presets = makePresets({ showCustomModal: false });
    const { container } = render(<CustomPresetModal presets={presets} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders modal when showCustomModal is true', () => {
    const presets = makePresets();
    render(<CustomPresetModal presets={presets} />);
    expect(screen.getByText('Add Custom Preset')).toBeDefined();
    expect(screen.getByPlaceholderText('Preset name (required)')).toBeDefined();
  });

  it('shows "Edit Preset" title when editing', () => {
    const presets = makePresets({ editingPresetId: 'some-id' });
    render(<CustomPresetModal presets={presets} />);
    expect(screen.getByText('Edit Preset')).toBeDefined();
  });

  it('calls setShowCustomModal(false) when X is clicked', async () => {
    const user = userEvent.setup();
    const presets = makePresets();
    render(<CustomPresetModal presets={presets} />);
    const closeButtons = screen.getAllByRole('button');
    // The X button is the last button in the header
    const xBtn = closeButtons.find(b => b.querySelector('svg'));
    if (xBtn) await user.click(xBtn);
    expect(presets.setShowCustomModal).toHaveBeenCalledWith(false);
  });

  it('disables Save when name is empty', () => {
    const presets = makePresets({ customForm: { name: '', rules: makeDefaultRules() } });
    render(<CustomPresetModal presets={presets} />);
    const saveBtn = screen.getByText('Save Preset');
    expect(saveBtn.closest('button')?.disabled).toBe(true);
  });

  it('calls saveCustomPreset when Save is clicked', async () => {
    const user = userEvent.setup();
    const presets = makePresets({ customForm: { name: 'My Preset', rules: makeDefaultRules() } });
    render(<CustomPresetModal presets={presets} />);
    await user.click(screen.getByText('Save Preset'));
    expect(presets.saveCustomPreset).toHaveBeenCalled();
  });
});
