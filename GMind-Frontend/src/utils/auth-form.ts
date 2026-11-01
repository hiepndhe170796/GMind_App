export type AuthFields = { displayName?: string; email?: string; password?: string; confirmPassword?: string };
export type AuthFieldErrors = Partial<Record<keyof AuthFields, string>>;

export function validateAuthFields(values: AuthFields, newPassword = false): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  if (values.displayName !== undefined && !values.displayName.trim()) errors.displayName = 'Nhập tên hiển thị của bạn.';
  if (values.email !== undefined) {
    if (!values.email.trim()) errors.email = 'Nhập địa chỉ email của bạn.';
    else if (!/^[^\s@]+@[^\s@]+$/.test(values.email.trim())) errors.email = 'Nhập địa chỉ email hợp lệ.';
  }
  if (values.password !== undefined) {
    if (!values.password) errors.password = 'Nhập mật khẩu của bạn.';
    else if (newPassword && values.password.length < 8) errors.password = 'Mật khẩu cần ít nhất 8 ký tự.';
  }
  if (values.confirmPassword !== undefined) {
    if (!values.confirmPassword) errors.confirmPassword = 'Nhập lại mật khẩu để xác nhận.';
    else if (values.password !== values.confirmPassword) errors.confirmPassword = 'Mật khẩu xác nhận không khớp.';
  }
  return errors;
}

export function focusAuthError(errors: AuthFieldErrors) {
  const field = Object.keys(errors)[0];
  if (field) document.getElementById(field)?.focus();
}

export function authErrorMessage(error: unknown, fallback: string): string {
  const failure = error && typeof error === 'object' ? error as { status?: number; message?: unknown } : undefined;
  if (failure?.status === 401) return 'Email hoặc mật khẩu không đúng.';
  if (failure?.status === 409) return 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.';
  if (failure?.message === 'Invalid or expired reset token')
    return 'Liên kết đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu liên kết mới.';
  if (failure?.message === 'Password recovery is not configured')
    return 'Chức năng khôi phục mật khẩu chưa được cấu hình. Vui lòng thử lại sau.';
  if (typeof failure?.message === 'string' && failure.message && failure.status !== 500) return failure.message;
  return fallback;
}
