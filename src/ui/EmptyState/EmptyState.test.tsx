import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title and body with role=status', () => {
    render(<EmptyState title="No boards yet" body="Create your first board." />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /no boards yet/i })).toBeInTheDocument();
    expect(screen.getByText(/create your first board/i)).toBeInTheDocument();
  });

  it('renders an action when provided', () => {
    render(
      <EmptyState
        title="No kids yet"
        body="Add a kid to get started."
        action={<button type="button">Add</button>}
      />,
    );
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });
});
