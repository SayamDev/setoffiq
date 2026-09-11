import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Wordmark } from './Wordmark';

describe('Wordmark', () => {
  // The "o" is a drawing, so without an explicit name the heading would read
  // as "SetffIQ" — or as three fragments — to anyone using a screen reader.
  it('is announced as the whole name, not the letters around the dial', () => {
    render(
      <h1>
        <Wordmark />
      </h1>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'SetoffIQ' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'SetoffIQ' })).toBeInTheDocument();
  });
});
