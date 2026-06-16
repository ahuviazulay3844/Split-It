import { UserSummary } from './group.model';

/** Minimal category shape as populated on an expense. */
export interface CategoryRef {
  _id: string;
  name: string;
}

/** Per-participant owed amount stored on an expense (server "splits"). */
export interface ExpenseSplit {
  userId: string;
  share: number;
}

/** A group expense as returned by GET /groups/:id/expenses. */
export interface Expense {
  _id: string;
  groupId: string;
  payerId: UserSummary;
  amount: number;
  description?: string;
  categoryId?: CategoryRef;
  splitType: 'equal' | 'custom';
  participants: string[];
  splits: ExpenseSplit[];
  date: string;
  createdAt: string;
}

/** One participant's owed amount when sending a custom (partial) split. */
export interface ExpenseSplitInput {
  userId: string;
  amount: number;
}

/** Request body for POST /expenses. */
export interface CreateExpensePayload {
  groupId: string;
  amount: number;
  description?: string;
  categoryId?: string;
  payerId?: string;
  splits?: ExpenseSplitInput[];
}
