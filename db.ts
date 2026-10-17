import Dexie, { type EntityTable } from "dexie";
import type { ExpenseIconName } from "./ExpenseIcons";
import type { CurrencyCode } from "./currency";
import type { IncomeIconName } from "./IncomeIcons";

export interface Expense {
  id? : number;
  title: string | null;
  amount: number;
  currency: CurrencyCode;
  categoryId: number; // food, electricity
  account: string; // UPI, Cash -> ExpenseCategory
  date: string;
}

export interface Income {
    id?:number;
    title:string | null;
    amount : number;
    currency: CurrencyCode;
    categoryId: number | null;
    account: string | null;
    date: string;
}

export interface Category {
  id?: number;
  name: string;
  icon: ExpenseIconName;
}

export type BudgetTime =
  | "1 month"
  | "15 days"
  | "1 week"
  | "1 day"
  | "custom";

export interface Budget {
    id?:number;
    title:string | null;
    amount : number;
    categoryId: number;
    date:string;
    time: BudgetTime;
    endDate?: string;
}

export interface Accounts{
  id? : number;
  name : string;
  icon : IncomeIconName; // UPI, Cash icon -> IncomeCategory
}
export interface IncomeCategory{
    id? : number;
    name : string;
    icon : IncomeIconName
}

export interface ExpenseCategory{
    id? : number;
    name : string;
    icon : ExpenseIconName
}

class PennyWiseDB extends Dexie {
  expenses!: EntityTable<Expense, "id">;
  incomes!: EntityTable<Income, "id">;
  accounts!: EntityTable<Accounts, "id">;
  categories!: EntityTable<Category, "id">;
  expense_categories!: EntityTable<ExpenseCategory, "id">;
  income_categories!: EntityTable<IncomeCategory, "id">;
  budgets!: EntityTable<Budget, "id">;

  constructor() {
    super("PennyWiseDB");

    this.version(2).stores({
      expenses: "++id, title, amount, currency, categoryId, account, date",
      incomes: "++id, currency, categoryId, date",
      accounts: "++id, name",
      categories: "++id, name",
      expense_categories: "++id, name",
      income_categories: "++id, name",
      budgets: "++id, categoryId, date, time",
    });
  }
}

export const db = new PennyWiseDB();