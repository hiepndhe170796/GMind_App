import type { IconName } from '../components/ui/Icon';

/** Mirrors the server-side FileValidator allowlist. */
export const FILE_RULES = {
  allowedExtensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip'] as const,
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  MAX_ATTACHMENTS: 5,
};

export const ACCEPT = FILE_RULES.allowedExtensions.map(e => `.${e}`).join(',');

export function validateClientFile(file: { name: string; size: number }): string | null {
  if (file.size <= 0) return 'Tệp trống.';
  if (file.size > FILE_RULES.MAX_FILE_BYTES) return 'Tệp vượt quá 10 MB.';
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (!(FILE_RULES.allowedExtensions as readonly string[]).includes(ext)) return 'Định dạng tệp không được hỗ trợ.';
  return null;
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
export const isImageExt = (ext: string) => IMAGE_EXTS.has(ext.toLowerCase());
export const extOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
};

const ICONS: Record<string, IconName> = {
  pdf: 'file', doc: 'file', docx: 'file', xls: 'file', xlsx: 'file',
  ppt: 'file', pptx: 'file', txt: 'file', md: 'file', csv: 'file', zip: 'file',
};
export const fileIconFor = (ext: string): IconName =>
  isImageExt(ext) ? 'photo' : (ICONS[ext.toLowerCase()] ?? 'file');
