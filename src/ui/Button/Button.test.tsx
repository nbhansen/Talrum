import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it.each(['primary', 'ghost', 'pill'] as const)('renders %s variant', (variant) => {
    render(<Button variant={variant}>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('renders an icon slot before children', () => {
    render(
      <Button variant="primary" icon={<span data-testid="icon">+</span>}>
        Add
      </Button>,
    );
    const button = screen.getByRole('button');
    const icon = screen.getByTestId('icon');
    expect(button.firstChild).toBe(icon);
  });

  it('forwards the type attribute but defaults to "button"', () => {
    render(<Button variant="primary">Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});
