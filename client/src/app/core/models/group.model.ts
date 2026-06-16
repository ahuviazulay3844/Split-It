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
