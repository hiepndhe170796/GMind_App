// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ResponsiveFilters from './ResponsiveFilters';

afterEach(cleanup);

describe('ResponsiveFilters', () => {
  it('keeps search available and toggles the existing panel without unmounting it', () => {
    render(<ResponsiveFilters search={<input aria-label="Search" />}>
      <input aria-label="Existing filter" defaultValue="Keep me" />
    </ResponsiveFilters>);
    const toggle = screen.getByRole('button', { name: 'Bộ lọc' });
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    const filter = screen.getByLabelText('Existing filter');
    expect(screen.getByLabelText('Search')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel.classList.contains('hidden')).toBe(true);
    expect(panel.classList.contains('md:block')).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.classList.contains('hidden')).toBe(false);
    fireEvent.change(filter, { target: { value: 'My selection' } });
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Existing filter')).toBe(filter);
    expect((filter as HTMLInputElement).value).toBe('My selection');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('exposes applied hidden filters and uses unique accessible panel IDs', () => {
    render(<>
      <ResponsiveFilters activeCount={2} search={<input aria-label="First search" />}><span>First panel</span></ResponsiveFilters>
      <ResponsiveFilters search={<input aria-label="Second search" />}><span>Second panel</span></ResponsiveFilters>
    </>);
    const first = screen.getByRole('button', { name: 'Bộ lọc (2)' });
    const second = screen.getByRole('button', { name: 'Bộ lọc' });
    const firstId = first.getAttribute('aria-controls')!;
    const secondId = second.getAttribute('aria-controls')!;
    expect(firstId).not.toBe(secondId);
    expect(document.getElementById(firstId)?.textContent).toBe('First panel');
    expect(document.getElementById(secondId)?.textContent).toBe('Second panel');
    expect(first.classList.contains('min-h-11')).toBe(true);
    expect(first.classList.contains('md:hidden')).toBe(true);
  });
});
