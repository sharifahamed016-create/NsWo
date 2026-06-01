/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum MemberStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum MemberRoleType {
  GENERAL = 'general',
  ADVISORY = 'advisory',
  VOLUNTEER = 'volunteer',
  MANAGEMENT = 'management',
  DONOR = 'donor',
}

export interface Member {
  id: string;
  memberId: string; // Custom ID like NSWO-001
  name: string;
  nameBn?: string;
  phone: string;
  secondaryPhone?: string;
  address: string;
  photoURL?: string;
  status: MemberStatus;
  roleType?: MemberRoleType;
  joinedDate: string;
  monthlySubscription: number;
  balance: number;
  totalPaid: number;
  totalDue: number;
  designation?: string;
  designationBn?: string;
  responsibilities?: string;
  adviceNotes?: string;
  country?: string;
  volunteerType?: string;
  dutyArea?: string;
  remindersActive?: boolean; // Control individual subscriber reminders
  includeInMonthlyLedger?: boolean; // Control whether the member is included in the monthly subscription ledger/sheet
  sortOrder?: number; // Manage manually sorted ordering
  createdAt: number;
  updatedAt: number;
}

export enum PaymentType {
  SUBSCRIPTION = 'subscription',
  DONATION = 'donation',
  ADMISSION = 'admission',
  OTHER = 'other'
}

export interface Payment {
  id: string;
  memberId: string;
  memberName: string;
  memberNameBn: string;
  amount: number;
  date: string;
  month: string; // e.g. "2024-05"
  year: number;
  type: PaymentType;
  receiptNo: string;
  method: string;
  remarks?: string;
  trxId?: string;
  senderPhone?: string;
  paymentStatus?: 'pending' | 'verified';
  createdAt: number;
}

export enum ExpenseCategory {
  OFFICE = 'office',
  CHARITY = 'charity',
  EVENT = 'event',
  TECHNICAL = 'technical',
  UTILITY = 'utility',
  OTHER = 'other'
}

export interface Expense {
  id: string;
  amount: number;
  date: string;
  category: ExpenseCategory | string;
  description: string;
  requestedBy: string;
  createdAt: number;
}

export interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  totalCollection: number;
  totalDue: number;
  totalExpenses: number;
  currentBalance: number;
}

export interface AppEvent {
  id: string;
  title: string;
  titleBn: string;
  date: string;
  budget: number;
  location?: string;
  locationBn?: string;
  imageURL?: string;
  description: string;
  descriptionBn: string;
  status: 'upcoming' | 'ongoing' | 'completed';
  createdAt: number;
}

export interface EventDonor {
  id: string;
  eventId: string;
  name: string;
  nameBn: string;
  phone: string;
  address?: string;
  amount: number;
  paymentMethod?: string;
  date: string;
  receiptNo: string;
  remarks?: string;
  createdAt: number;
}

export interface EventExpense {
  id: string;
  eventId: string;
  title: string;
  titleBn: string;
  amount: number;
  category: string;
  date: string;
  remarks?: string;
  receiptURL?: string;
  createdAt: number;
}

export interface Activity {
  id?: string;
  type: string;
  message: string;
  messageBn: string;
  userEmail: string;
  createdAt: number;
}

export interface BloodDonor {
  id: string;
  name: string;
  nameBn?: string;
  bloodGroup: string;
  phone: string;
  alternatePhone?: string;
  location: string;
  locationBn?: string;
  isAvailable: boolean;
  lastDonationDate?: string;
  remarks?: string;
  createdAt: number;
  updatedAt: number;
}
