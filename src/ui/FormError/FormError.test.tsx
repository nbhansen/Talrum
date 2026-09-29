import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormError } from './FormError';

describe('FormError', () => {
  it('announces its message as an alert', () => {
    render(<FormError>Upload failed.</FormError>);
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed.');
  });
});
