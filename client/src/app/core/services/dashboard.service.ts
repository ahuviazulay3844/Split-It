import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '../models/api-response.model';
import { Dashboard } from '../models/dashboard.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  getDashboard(): Observable<ApiResponse<Dashboard>> {
    return this.api.get<ApiResponse<Dashboard>>('/dashboard');
  }
}
