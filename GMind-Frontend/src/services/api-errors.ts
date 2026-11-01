import axios from 'axios';

export interface ApiError { message: string; code?: string; status?: number; errors?: string[] }

export function normalizeApiError(error: unknown): ApiError {
  if (!axios.isAxiosError(error)) return { code: 'UNEXPECTED_ERROR', message: 'Đã xảy ra lỗi. Vui lòng thử lại.' };
  const status = error.response?.status;
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return { code: 'TIMEOUT', status, message: 'Máy chủ phản hồi quá chậm. Vui lòng thử lại.' };
  }
  if (!error.response) {
    return { code: 'NETWORK_ERROR', message: 'Không thể kết nối máy chủ. Kiểm tra kết nối và bảo đảm GMind.API đang chạy.' };
  }
  const data: unknown = error.response.data;
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  if (body.code === 'API_UNAVAILABLE') {
    return { code: 'API_UNAVAILABLE', status, message: 'Không thể kết nối máy chủ GMind. Hãy chạy GMind.API trong Visual Studio rồi thử lại.' };
  }
  if (status === 503) {
    return { code: 'SERVICE_UNAVAILABLE', status, message: 'Máy chủ chưa sẵn sàng. Kiểm tra kết nối SQL Server của GMind.API rồi thử lại.' };
  }
  return {
    status,
    code: typeof body.code === 'string' ? body.code : undefined,
    message: typeof body.message === 'string' ? body.message : 'Không thể thực hiện yêu cầu. Vui lòng thử lại.',
    errors: Array.isArray(body.errors) ? body.errors.filter((item): item is string => typeof item === 'string') : undefined,
  };
}
