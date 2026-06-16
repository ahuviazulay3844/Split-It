import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '../constants/auth.constants';
import { ApiResponse } from '../models/api-response.model';
import {
  AuthResult,
  LoginPayload,
  RegisterPayload,
  User,
} from '../models/user.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly currentUser = signal<User | null>(this.readStoredUser());

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  register(payload: RegisterPayload): Observable<ApiResponse<AuthResult>> {
    return this.api.post<ApiResponse<AuthResult>, RegisterPayload>('/auth/register', payload).pipe(
      tap((response) => {
        if (response.status === 'success' && response.data) {
          this.persistSession(response.data);
        }
      })
    );
  }

  login(payload: LoginPayload): Observable<ApiResponse<AuthResult>> {
    return this.api.post<ApiResponse<AuthResult>, LoginPayload>('/auth/login', payload).pipe(
      tap((response) => {
        if (response.status === 'success' && response.data) {
          this.persistSession(response.data);
        }
      })
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/auth']);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  private persistSession({ token, user }: AuthResult): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  private readStoredUser(): User | null {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const raw = localStorage.getItem(USER_STORAGE_KEY);

    if (!token || !raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as User;
    } catch {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
      return null;
    }
  }
}
