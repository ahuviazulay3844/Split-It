import { GroupSummary, UserSummary } from './group.model';

export interface SettlementEntry {
  groupId: string;
  to?: UserSummary;
  from?: UserSummary;
  amount: number;
}

export interface PendingSettlements {
  count: number;
  totalIOwe: number;
  totalOwedToMe: number;
  iOwe: SettlementEntry[];
  owedToMe: SettlementEntry[];
}

export interface Dashboard {
  groupCount: number;
  netBalance: number;
  groups: GroupSummary[];
  activeGroups: GroupSummary[];
  closedGroups: GroupSummary[];
  pendingSettlements: PendingSettlements;
}
