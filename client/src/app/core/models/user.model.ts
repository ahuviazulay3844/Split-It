export type UserRole = 'Admin' | 'Customer';

export interface User {
  _id: string;
  firstName: string;
  familyName: string;
  email: string;
  phone?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterPayload {
  firstName: string;
  familyName: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResult {
  token: string;
  user: User;
}
