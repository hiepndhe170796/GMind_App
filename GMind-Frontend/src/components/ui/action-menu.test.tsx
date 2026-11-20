// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActionMenu from './ActionMenu';

const renderMenu = (items?: Partial<Parameters<typeof ActionMenu>[0]['items'][number]>[]) =>
  render(<ActionMenu label="Thêm" items={[
    { label: 'Một', onSelect: vi.fn() },
    { label: 'Hai', onSelect: vi.fn(), ...items?.[0] },
    { label: 'Ba', danger: true, onSelect: vi.fn() },
  ]} />);

afterEach(cleanup);

describe('ActionMenu', () => {
  it('opens on click, exposes menu/menuitems, selects with Enter', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Thêm' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu');
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: 'Enter' });
    fireEvent.click(document.activeElement as HTMLElement);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it('ArrowUp/Home/End navigate; disabled items skipped', () => {
    renderMenu([{ disabled: true, disabledReason: 'Không khả dụng' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    const menu = screen.getByRole('menu');
    const items = screen.getAllByRole('menuitem');
    expect(items[1].getAttribute('aria-disabled')).toBe('true');
    expect(items[1].getAttribute('title')).toBe('Không khả dụng');
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[2]); // skips disabled middle
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Thêm' }));
  });
  it('click outside closes without focusing trigger', () => {
    render(<div><ActionMenu label="Thêm" items={[{ label: 'X', onSelect: vi.fn() }]} /><button>Khác</button></div>);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Khác' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
