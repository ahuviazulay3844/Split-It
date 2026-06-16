import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '../models/api-response.model';
import { CreateGroupPayload, GroupSummary } from '../models/group.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class GroupService {
  private readonly api = inject(ApiService);

  getDashboardGroups(): Observable<ApiResponse<GroupSummary[]>> {
    return this.api.get<ApiResponse<GroupSummary[]>>('/groups/dashboard');
  }

  createGroup(payload: CreateGroupPayload): Observable<ApiResponse<GroupSummary>> {
    return this.api.post<ApiResponse<GroupSummary>, CreateGroupPayload>('/groups', payload);
  }
}
