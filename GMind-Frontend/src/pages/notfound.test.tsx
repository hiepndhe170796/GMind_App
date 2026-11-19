// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NotFound from './NotFound';
import App from '../App';

const mock = vi.hoisted(() => ({ loggedIn: true }));
vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../layouts/AuthLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../services/auth', () => ({ authService: { isLoggedIn: () => mock.loggedIn } }));

const renderAt = () => render(
  <MemoryRouter initialEntries={['/khong-ton-tai']}><Routes><Route path="*" element={<NotFound />} /></Routes></MemoryRouter>);

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('NotFound', () => {
  it('logged in: heading plus primary link to /dashboard', () => {
    mock.loggedIn = true;
    renderAt();
    expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về Tổng quan' }).getAttribute('href')).toBe('/dashboard');
  });
  it('logged out: primary link to /login', () => {
    mock.loggedIn = false;
    renderAt();
    expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về Đăng nhập' }).getAttribute('href')).toBe('/login');
  });

  it('App router: unknown path renders NotFound, URL is not redirected', async () => {
    mock.loggedIn = false;
    window.history.pushState({}, '', '/khong-ton-tai');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeTruthy();
    expect(window.location.pathname).toBe('/khong-ton-tai');
  });
});
