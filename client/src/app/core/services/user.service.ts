import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '../models/api-response.model';
import { UserSummary } from '../models/group.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly api = inject(ApiService);

  searchUsers(query: string): Observable<ApiResponse<UserSummary[]>> {
    return this.api.get<ApiResponse<UserSummary[]>>('/users/search', { q: query });
  }
}
