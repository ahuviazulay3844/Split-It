import { Component, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { LoginPayload } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login-form',
  imports: [ReactiveFormsModule],
  templateUrl: './login-form.component.html',
  styleUrl: './login-form.component.scss',
})
export class LoginFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly loggedIn = output<void>();

  protected errorMessage: string | null = null;
  protected loadingState = false;

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(1)]],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loadingState = true;
    this.errorMessage = null;

    const payload: LoginPayload = this.form.getRawValue();

    this.auth.login(payload).subscribe({
      next: () => {
        this.loadingState = false;
        this.loggedIn.emit();
      },
      error: (err) => {
        this.loadingState = false;
        this.errorMessage = err.error?.message ?? 'Invalid email or password';
      },
    });
  }

  protected fieldError(field: 'email' | 'password'): string | null {
    const control = this.form.controls[field];
    if (!control.touched || !control.errors) {
      return null;
    }

    if (control.errors['required']) {
      return field === 'email' ? 'Email is required' : 'Password is required';
    }

    if (control.errors['email']) {
      return 'Invalid email address';
    }

    return null;
  }
}
