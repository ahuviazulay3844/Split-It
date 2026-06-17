import { Component, inject, signal } from '@angular/core';

import { HealthResponse } from '../../core/models/health.model';
import { HealthService } from '../../core/services/health.service';

@Component({
  selector: 'app-health-check',
  template: `
    <main class="page" dir="rtl">
      <section class="hero">
        <p class="eyebrow">SplitIt</p>
        <h1>הקליינט והשרת מוכנים לתקשר.</h1>
        <p>
          קליינט Angular קורא לנקודת הקצה <code>/health</code> של Express דרך הפרוקסי המקומי.
          תשובה מוצלחת מאשרת שהחיבור תקין.
        </p>
      </section>

      <section class="status-card" [class.ok]="health()?.status === 'ok'" [class.error]="error()">
        <div>
          <p class="label">חיבור ל-API</p>
          @if (loading()) {
            <h2>בודק...</h2>
          } @else if (health()) {
            <h2>מחובר</h2>
            <p>סטטוס שרת: {{ health()?.status }}</p>
            <p>זמן בדיקה: {{ health()?.timestamp }}</p>
          } @else {
            <h2>אין חיבור</h2>
            <p>{{ error() }}</p>
          }
        </div>

        <button type="button" (click)="checkHealth()">בדיקה חוזרת</button>
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
        this.error.set('לא ניתן להגיע לשרת. ודאו ששרת Express פועל.');
        this.loading.set(false);
      },
    });
  }
}
