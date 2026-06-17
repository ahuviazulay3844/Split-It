import { Component, inject, output, signal } from '@angular/core';
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
  readonly switchToRegister = output<string>();

  protected errorMessage: string | null = null;
  protected loadingState = false;
  protected readonly showPassword = signal(false);

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
        const status = err.status;
        const email = this.form.controls.email.getRawValue().trim().toLowerCase();

        if (status === 404 && email) {
          // No account exists for this email — offer to register.
          this.switchToRegister.emit(email);
          return;
        }

        if (status === 401) {
          // Account exists but password is wrong — stay on login form.
          this.errorMessage = 'הסיסמה שגויה. נסו שוב.';
          return;
        }

        this.errorMessage = 'כתובת הדוא"ל או הסיסמה שגויות';
      },
    });
  }

  protected fieldError(field: 'email' | 'password'): string | null {
    const control = this.form.controls[field];
    if (!control.touched || !control.errors) {
      return null;
    }

    if (control.errors['required']) {
      return field === 'email' ? 'יש להזין כתובת דוא"ל' : 'יש להזין סיסמה';
    }

    if (control.errors['email']) {
      return 'כתובת הדוא"ל אינה תקינה';
    }

    return null;
  }
}
