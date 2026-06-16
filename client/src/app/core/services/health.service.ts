import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { HEALTH_ENDPOINT } from '../config/api.config';
import { HealthResponse } from '../models/health.model';

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);

  check(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(HEALTH_ENDPOINT);
  }
}
