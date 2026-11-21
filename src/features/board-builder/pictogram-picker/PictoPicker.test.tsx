import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { pictogramsQueryKey } from '@/lib/queries/pictograms';
import { makeClient, makeWrapper } from '@/lib/queries/queries.test-utils';
import type { Pictogram } from '@/types/domain';

import { PictoPicker } from './PictoPicker';

const SEED_PICTOGRAMS: Pictogram[] = [
  { id: 'p-apple', slug: 'apple', label: 'Apple', style: 'illus', glyph: 'heart', tint: '#fff' },
  { id: 'p-cup', slug: 'cup', label: 'Cup', style: 'illus', glyph: 'heart', tint: '#fff' },
  { id: 'p-shoes', slug: 'shoes', label: 'Shoes', style: 'illus', glyph: 'heart', tint: '#fff' },
];

const renderPicker = (onConfirm = vi.fn(), onClose = vi.fn()): void => {
  const client = makeClient();
  client.setQueryData(pictogramsQueryKey, SEED_PICTOGRAMS);
  render(<PictoPicker ownerId="owner-1" onClose={onClose} onConfirm={onConfirm} />, {
    wrapper: makeWrapper(client),
  });
};

describe('PictoPicker', () => {
  it('renders the library tab by default with all seed pictograms', () => {
    renderPicker();
    expect(screen.getByRole('heading', { name: 'Add pictograms' })).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Cup')).toBeInTheDocument();
    expect(screen.getByText('Shoes')).toBeInTheDocument();
  });

  it('shows the real pictogram count in the Library tab sub, not a mockup', () => {
    renderPicker();
    const libraryTab = within(screen.getByRole('tablist')).getByRole('tab', { name: /Library/ });
    expect(libraryTab).toHaveTextContent(String(SEED_PICTOGRAMS.length));
    expect(libraryTab).not.toHaveTextContent('1,400');
  });

  it('switches between library and upload tabs', async () => {
    const user = userEvent.setup();
    renderPicker();
    const tablist = screen.getByRole('tablist');
    const libraryTab = within(tablist).getByRole('tab', { name: /Library/ });
    const uploadTab = within(tablist).getByRole('tab', { name: /Upload/ });

    expect(libraryTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByPlaceholderText(/Search eat, dress/)).toBeInTheDocument();

    await user.click(uploadTab);
    expect(uploadTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByPlaceholderText(/Search eat, dress/)).not.toBeInTheDocument();

    await user.click(libraryTab);
    expect(libraryTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByPlaceholderText(/Search eat, dress/)).toBeInTheDocument();
  });

  it('disables Add to board until a pictogram is selected (#523)', async () => {
    const user = userEvent.setup();
    renderPicker();

    expect(screen.getByRole('button', { name: 'Add to board' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Apple' }));
    expect(screen.getByRole('button', { name: 'Add 1 to board' })).toBeEnabled();
  });

  it('toggles selection and reflects the count + label in the footer', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderPicker(onConfirm, onClose);

    expect(screen.getByText('0 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apple' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add 1 to board/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cup' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apple' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Add 1 to board/ }));
    expect(onConfirm).toHaveBeenCalledWith(['p-cup']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters the library by search query', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(screen.getByPlaceholderText(/Search eat, dress/), 'app');
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('Cup')).not.toBeInTheDocument();
    expect(screen.queryByText('Shoes')).not.toBeInTheDocument();
  });
});
