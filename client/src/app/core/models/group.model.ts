export interface UserSummary {
  _id: string;
  firstName: string;
  familyName: string;
  email: string;
}

export interface GroupSummary {
  _id: string;
  groupCode: string;
  groupName: string;
  adminId: UserSummary;
  totalExpenses: number;
  avgPerPerson: number;
  roleInGroup: 'Admin' | 'Member';
  balance: number;
  createdAt: string;
}

export interface CreateGroupPayload {
  groupName: string;
  memberIds: string[];
}

export type GroupRole = 'Admin' | 'Member';

/** A single member's standing inside a group (from the overview endpoint). */
export interface GroupMemberView {
  user: UserSummary;
  roleInGroup: GroupRole;
  balance: number;
  status: 'Active' | 'Settled';
}

/** One transfer in the group's simplified settlement plan. */
export interface SettlementView {
  settlementId: string;
  from: UserSummary;
  to: UserSummary;
  amount: number;
}

/** Aggregated, server-computed snapshot of a group (GET /groups/:id/overview). */
export interface GroupOverview {
  group: {
    _id: string;
    groupName: string;
    groupCode: string;
    admin: UserSummary;
    totalExpenses: number;
    avgPerPerson: number;
    memberCount: number;
  };
  members: GroupMemberView[];
  settlements: SettlementView[];
}

/** A single "who I owe" / "who owes me" edge for the logged-in user. */
export interface DebtEntry {
  settlementId: string;
  to?: UserSummary;
  from?: UserSummary;
  amount: number;
}

/** Personal balance snapshot for the logged-in user (GET /groups/:id/balance). */
export interface PersonalBalance {
  net: number;
  totalIOwe: number;
  totalOwedToMe: number;
  iOwe: DebtEntry[];
  owedToMe: DebtEntry[];
}
