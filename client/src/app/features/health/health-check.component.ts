import { Component, inject, signal } from '@angular/core';

import { HealthResponse } from '../../core/models/health.model';
import { HealthService } from '../../core/services/health.service';

@Component({
  selector: 'app-health-check',
  template: `
    <main class="page">
      <section class="hero">
        <p class="eyebrow">SplitIt</p>
        <h1>Client and server are ready to talk.</h1>
        <p>
          This Angular client calls the Express <code>/health</code> endpoint through the local
          proxy. A successful response confirms the connection.
        </p>
      </section>

      <section class="status-card" [class.ok]="health()?.status === 'ok'" [class.error]="error()">
        <div>
          <p class="label">API connection</p>
          @if (loading()) {
            <h2>Checking...</h2>
          } @else if (health()) {
            <h2>Connected</h2>
            <p>Server status: {{ health()?.status }}</p>
            <p>Timestamp: {{ health()?.timestamp }}</p>
          } @else {
            <h2>Not connected</h2>
            <p>{{ error() }}</p>
          }
        </div>

        <button type="button" (click)="checkHealth()">Check again</button>
      </section>
    </main>
  `,
  styleUrl: './health-check.component.scss',
})
export class HealthCheckComponent {
  private readonly healthService = inject(HealthService);

  protected readonly health = signal<HealthResponse | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);

  constructor() {
    this.checkHealth();
  }

  protected checkHealth(): void {
    this.loading.set(true);
    this.error.set(null);

    this.healthService.check().subscribe({
      next: (response) => {
        this.health.set(response);
        this.loading.set(false);
      },
      error: () => {
        this.health.set(null);
        this.error.set('Could not reach the server. Make sure the Express server is running.');
        this.loading.set(false);
      },
    });
  }
}
