import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SettingsRow } from './SettingsRow';

const baseProps = {
  labelsVisible: true,
  onLabelsChange: () => undefined,
  voiceMode: 'tts' as const,
  onVoiceModeChange: () => undefined,
  kidReorderable: false,
  onKidReorderableChange: () => undefined,
  stepCount: 0,
};

describe('SettingsRow', () => {
  it('shows the "Kid can reorder" toggle on sequence boards', () => {
    render(<SettingsRow {...baseProps} kind="sequence" onKindChange={() => undefined} />);
    expect(screen.getByText('Kid can reorder')).toBeInTheDocument();
  });

  it('hides the "Kid can reorder" toggle on choice boards', () => {
    render(<SettingsRow {...baseProps} kind="choice" onKindChange={() => undefined} />);
    expect(screen.queryByText('Kid can reorder')).toBeNull();
  });

  it('counts sequence tiles as "steps" (#236)', () => {
    render(
      <SettingsRow {...baseProps} kind="sequence" onKindChange={() => undefined} stepCount={3} />,
    );
    expect(screen.getByText(/3 steps · drag to reorder/)).toBeInTheDocument();
  });

  it('counts choice tiles as "options" (#236)', () => {
    render(
      <SettingsRow {...baseProps} kind="choice" onKindChange={() => undefined} stepCount={4} />,
    );
    expect(screen.getByText(/4 options · drag to reorder/)).toBeInTheDocument();
  });

  it('singular forms drop the trailing "s"', () => {
    render(
      <SettingsRow {...baseProps} kind="choice" onKindChange={() => undefined} stepCount={1} />,
    );
    expect(screen.getByText(/1 option · drag to reorder/)).toBeInTheDocument();
  });
});
