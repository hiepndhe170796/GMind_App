// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../ui/Toast';
import FileUploader from './FileUploader';
import DocumentsCard from './DocumentsCard';
import { filesService, type FileDto } from '../../services/files';
import type { LinkDto } from '../../services/tasks';
import { saveSession, clearSession, type AuthResult } from '../../services/session';

const SESSION: AuthResult = {
  accessToken: 't', refreshToken: 'r', expiresAt: '2100-01-01',
  user: { id: 'u1', displayName: 'An', email: 'a@x.dev', avatarUrl: null },
};

const mount = (node: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ToastProvider>{node}</ToastProvider>
  </QueryClientProvider>);

const file = (name: string, size = 100, type = 'image/png') => new File([new Uint8Array(size)], name, { type });
const input = () => document.querySelector('input[type="file"]')!;

const fileDto = (over: Partial<FileDto> = {}): FileDto => ({
  id: 'f1', kind: 'project', name: 'spec.pdf', extension: 'pdf', contentType: 'application/pdf',
  sizeBytes: 2048, uploadedByUserId: 'u1', uploadedByName: 'An', createdAt: '2026-01-02T00:00:00Z',
  isImage: false, canDelete: true, ...over,
});
const linkDto = (over: Partial<LinkDto> = {}): LinkDto => ({
  id: 'l1', projectId: 'p1', url: 'https://docs.example.com/a', displayName: 'Spec',
  createdByName: 'An', createdAt: '2026-01-01T00:00:00Z', canDelete: true, ...over,
});

beforeEach(() => { saveSession(SESSION); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

describe('FileUploader', () => {
  it('uploads sequentially, toasts once and calls onUploaded', async () => {
    const calls: string[] = [];
    const upload = vi.fn(async (f: File) => { calls.push(f.name); });
    const onUploaded = vi.fn();
    mount(<FileUploader upload={upload} onUploaded={onUploaded} />);
    fireEvent.change(input(), { target: { files: [file('a.png'), file('b.pdf', 50, 'application/pdf')] } });
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(['a.png', 'b.pdf']);
    expect(await screen.findByText('Đã tải lên 2 tệp.')).toBeTruthy();
  });

  it('shows server error on the row', async () => {
    const upload = vi.fn(async () => { throw { message: 'Dung lượng hết.' }; });
    mount(<FileUploader upload={upload} onUploaded={vi.fn()} />);
    fireEvent.change(input(), { target: { files: [file('a.png')] } });
    expect(await screen.findByText('Dung lượng hết.')).toBeTruthy();
  });

  it('cancel aborts the in-flight upload', async () => {
    let signal!: AbortSignal;
    const upload = vi.fn((_f: File, o: { signal?: AbortSignal }) => new Promise((_r, rej) => {
      signal = o.signal!;
      signal.addEventListener('abort', () => rej(new Error('aborted')));
    }));
    mount(<FileUploader upload={upload} onUploaded={vi.fn()} />);
    fireEvent.change(input(), { target: { files: [file('a.png')] } });
    await screen.findByRole('progressbar');
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(signal.aborted).toBe(true));
    expect(await screen.findByText('Đã hủy tải lên.')).toBeTruthy();
  });

  it('client-invalid files show an alert and are never sent', async () => {
    const upload = vi.fn();
    mount(<FileUploader upload={upload} onUploaded={vi.fn()} />);
    fireEvent.change(input(), { target: { files: [file('evil.exe'), file('ok.png')] } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('evil.exe');
    expect(alert.textContent).toContain('Định dạng tệp không được hỗ trợ.');
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  });

  it('appends files picked while a batch is running', async () => {
    const order: string[] = [];
    const gates: (() => void)[] = [];
    const upload = vi.fn((f: File) => new Promise<void>(res => { order.push(f.name); gates.push(res); }));
    mount(<FileUploader upload={upload} onUploaded={vi.fn()} />);
    fireEvent.change(input(), { target: { files: [file('a.png')] } });
    await waitFor(() => expect(order).toEqual(['a.png']));
    fireEvent.change(input(), { target: { files: [file('b.png')] } });
    gates[0]();
    await waitFor(() => expect(order).toEqual(['a.png', 'b.png']));
    gates[1]();
    await screen.findByText('Đã tải lên 2 tệp.');
  });
});

describe('DocumentsCard', () => {
  const base = {
    title: 'Tài liệu', canAdd: true, uploadFn: vi.fn(), onFilesChanged: vi.fn(),
    onAddLink: vi.fn(async () => {}), onDeleteLink: vi.fn(), onDeleteFile: vi.fn(),
    emptyText: 'Chưa có tài liệu nào.',
  };

  it('merges links and files newest first', () => {
    mount(<DocumentsCard {...base}
      links={[linkDto({ createdAt: '2026-01-01T00:00:00Z' })]}
      files={[fileDto({ createdAt: '2026-01-03T00:00:00Z' })]} />);
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('spec.pdf')).toBeTruthy();
    expect(within(items[1]).getByText('Spec')).toBeTruthy();
  });

  it('hides uploader and link button when canAdd is false', () => {
    mount(<DocumentsCard {...base} canAdd={false} links={[linkDto()]} files={[]} />);
    expect(screen.queryByText('chọn tệp')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thêm liên kết' })).toBeNull();
    expect(screen.queryByLabelText('Liên kết')).toBeNull();
  });

  it('link form is behind the disclosure and focuses url on open', async () => {
    mount(<DocumentsCard {...base} links={[]} files={[]} />);
    expect(screen.queryByLabelText('Liên kết')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm liên kết' }));
    const urlInput = await screen.findByLabelText('Liên kết');
    await waitFor(() => expect(document.activeElement).toBe(urlInput));
  });

  it('file delete confirm calls onDeleteFile', () => {
    mount(<DocumentsCard {...base} links={[]} files={[fileDto()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xóa tệp spec.pdf' }));
    expect(base.onDeleteFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }));
  });

  it('download goes through filesService.downloadFile', async () => {
    const spy = vi.spyOn(filesService, 'downloadFile').mockResolvedValue();
    mount(<DocumentsCard {...base} links={[]} files={[fileDto()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tải xuống spec.pdf' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' })));
  });
});
