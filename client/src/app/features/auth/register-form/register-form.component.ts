import { Component, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { RegisterPayload } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register-form',
  imports: [ReactiveFormsModule],
  templateUrl: './register-form.component.html',
  styleUrl: './register-form.component.scss',
})
export class RegisterFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly registered = output<void>();

  protected errorMessage: string | null = null;
  protected loadingState = false;

  protected readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
    familyName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    phone: [''],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loadingState = true;
    this.errorMessage = null;

    const raw = this.form.getRawValue();
    const payload: RegisterPayload = {
      firstName: raw.firstName.trim(),
      familyName: raw.familyName.trim(),
      email: raw.email.trim().toLowerCase(),
      password: raw.password,
      ...(raw.phone?.trim() ? { phone: raw.phone.trim() } : {}),
    };

    this.auth.register(payload).subscribe({
      next: () => {
        this.loadingState = false;
        this.registered.emit();
      },
      error: (err) => {
        this.loadingState = false;
        this.errorMessage = err.error?.message ?? 'Registration failed. Please try again.';
      },
    });
  }

  protected fieldError(
    field: 'firstName' | 'familyName' | 'email' | 'password' | 'phone'
  ): string | null {
    const control = this.form.controls[field];
    if (!control.touched || !control.errors) {
      return null;
    }

    if (control.errors['required']) {
      const labels: Record<string, string> = {
        firstName: 'First name is required',
        familyName: 'Family name is required',
        email: 'Email is required',
        password: 'Password is required',
      };
      return labels[field] ?? 'This field is required';
    }

    if (control.errors['minlength']) {
      const min = control.errors['minlength'].requiredLength;
      if (field === 'password') {
        return `Password must be at least ${min} characters`;
      }
      return `${field === 'firstName' ? 'First name' : 'Family name'} must be at least ${min} characters`;
    }

    if (control.errors['maxlength']) {
      const max = control.errors['maxlength'].requiredLength;
      if (field === 'password') {
        return `Password must be at most ${max} characters`;
      }
      return `${field === 'firstName' ? 'First name' : 'Family name'} must be at most ${max} characters`;
    }

    if (control.errors['email']) {
      return 'Invalid email address';
    }

    return null;
  }
}
