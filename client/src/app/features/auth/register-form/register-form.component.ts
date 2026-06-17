import { Component, effect, inject, input, output, signal } from '@angular/core';
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
  readonly prefillEmail = input<string>('');

  protected errorMessage: string | null = null;
  protected loadingState = false;
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
    familyName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    phone: ['', [Validators.pattern(/^05\d{8}$/)]],
  });

  constructor() {
    effect(() => {
      const email = this.prefillEmail().trim().toLowerCase();
      if (email) {
        this.form.controls.email.setValue(email);
      }
    });
  }

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
        this.errorMessage =
          err.status === 409 ? 'כתובת הדוא"ל כבר רשומה במערכת.' : 'ההרשמה נכשלה. נסו שוב.';
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
        firstName: 'יש להזין שם פרטי',
        familyName: 'יש להזין שם משפחה',
        email: 'יש להזין כתובת דוא"ל',
        password: 'יש להזין סיסמה',
      };
      return labels[field] ?? 'יש למלא את השדה הזה';
    }

    if (control.errors['minlength']) {
      const min = control.errors['minlength'].requiredLength;
      if (field === 'password') {
        return `הסיסמה חייבת להכיל לפחות ${min} תווים`;
      }
      return `${field === 'firstName' ? 'שם פרטי' : 'שם משפחה'} חייב להכיל לפחות ${min} תווים`;
    }

    if (control.errors['maxlength']) {
      const max = control.errors['maxlength'].requiredLength;
      if (field === 'password') {
        return `הסיסמה יכולה להכיל עד ${max} תווים`;
      }
      return `${field === 'firstName' ? 'שם פרטי' : 'שם משפחה'} יכול להכיל עד ${max} תווים`;
    }

    if (control.errors['email']) {
      return 'כתובת הדוא"ל אינה תקינה';
    }

    if (control.errors['pattern']) {
      return 'מספר טלפון לא תקין';
    }

    return null;
  }
}
