// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDocumentTitle } from './useDocumentTitle';

function Probe({ title }: { title?: string }) {
  useDocumentTitle(title);
  return null;
}

afterEach(cleanup);

describe('useDocumentTitle', () => {
  it('sets "<title> · GMind"', () => {
    render(<Probe title="Nhóm Alpha" />);
    expect(document.title).toBe('Nhóm Alpha · GMind');
  });

  it('sets bare "GMind" for an empty string', () => {
    render(<Probe title="" />);
    expect(document.title).toBe('GMind');
  });

  it('is a no-op when the title is undefined', () => {
    document.title = 'Trước đó · GMind';
    render(<Probe />);
    expect(document.title).toBe('Trước đó · GMind');
  });

  it('updates when the title changes', () => {
    const { rerender } = render(<Probe title="Một" />);
    rerender(<Probe title="Hai" />);
    expect(document.title).toBe('Hai · GMind');
  });
});
