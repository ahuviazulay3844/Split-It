import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { LoginFormComponent } from '../login-form/login-form.component';
import { RegisterFormComponent } from '../register-form/register-form.component';

type AuthTab = 'login' | 'register';

@Component({
  selector: 'app-auth-page',
  imports: [LoginFormComponent, RegisterFormComponent],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.scss',
})
export class AuthPageComponent {
  private readonly router = inject(Router);

  protected readonly activeTab = signal<AuthTab>('login');

  protected selectTab(tab: AuthTab): void {
    this.activeTab.set(tab);
  }

  protected onAuthenticated(): void {
    this.router.navigate(['/dashboard']);
  }
}
