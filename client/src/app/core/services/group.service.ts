import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '../models/api-response.model';
import {
  CreateGroupPayload,
  GroupOverview,
  GroupSummary,
  PersonalBalance,
} from '../models/group.model';
import { CreateExpensePayload, Expense } from '../models/expense.model';
import { ApiService } from './api.service';

interface AddExpenseResult {
  expense: Expense;
  summary: { totalExpenses: number; avgPerPerson: number; transfersCount: number };
}

@Injectable({ providedIn: 'root' })
export class GroupService {
  private readonly api = inject(ApiService);

  createGroup(payload: CreateGroupPayload): Observable<ApiResponse<GroupSummary>> {
    return this.api.post<ApiResponse<GroupSummary>, CreateGroupPayload>('/groups', payload);
  }

  /** Full server-computed group snapshot: stats, members, settlement plan. */
  getOverview(groupId: string): Observable<ApiResponse<GroupOverview>> {
    return this.api.get<ApiResponse<GroupOverview>>(`/groups/${groupId}/overview`);
  }

  /** Personal "who I owe / who owes me" snapshot for the logged-in user. */
  getMyBalance(groupId: string): Observable<ApiResponse<PersonalBalance>> {
    return this.api.get<ApiResponse<PersonalBalance>>(`/groups/${groupId}/balance`);
  }

  /** The group's expenses (newest first). */
  getExpenses(groupId: string): Observable<ApiResponse<Expense[]>> {
    return this.api.get<ApiResponse<Expense[]>>(`/groups/${groupId}/expenses`);
  }

  /**
   * Creates an expense. The server atomically recalculates balances and the
   * simplified debt graph, so the client only re-reads data afterwards.
   */
  addExpense(payload: CreateExpensePayload): Observable<ApiResponse<AddExpenseResult>> {
    return this.api.post<ApiResponse<AddExpenseResult>, CreateExpensePayload>('/expenses', payload);
  }
}
