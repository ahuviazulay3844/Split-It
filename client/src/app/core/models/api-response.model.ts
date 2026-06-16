export interface ApiResponse<T> {
  status: 'success' | 'error' | 'ok';
  data?: T;
  message?: string;
  timestamp?: string;
}
