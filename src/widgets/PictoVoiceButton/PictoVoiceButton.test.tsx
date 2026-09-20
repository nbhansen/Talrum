import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Pictogram } from '@/types/domain';

import { PictoVoiceButton } from './PictoVoiceButton';

const APPLE: Pictogram = { id: 'p1', label: 'Apple', style: 'illus', glyph: 'apple', tint: '#f00' };

describe('PictoVoiceButton', () => {
  it('offers to record when the pictogram has no recording', () => {
    render(<PictoVoiceButton picto={APPLE} onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Record voice for Apple' })).toBeInTheDocument();
  });

  it('offers to edit when the pictogram has a recording', () => {
    render(<PictoVoiceButton picto={{ ...APPLE, audioPath: 'o/p1.m4a' }} onClick={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Edit voice recording for Apple' }),
    ).toBeInTheDocument();
  });

  it('does not pass the click to the tile below it', () => {
    const onTile = vi.fn();
    const onClick = vi.fn();
    render(
      <div onClick={onTile}>
        <PictoVoiceButton picto={APPLE} onClick={onClick} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record voice for Apple' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onTile).not.toHaveBeenCalled();
  });
});
