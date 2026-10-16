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
  account: string; // UPI, Cash
  date: string;
}

export interface Income {
    id?:number;
    title:string | null;
    amount : number;
    currency: CurrencyCode;
    categoryId: number; // UPI, Cash
    date: string;
}

export interface Budget {
    id?:number;
    title:string | null;
    amount : number;
    categoryId: number;
    date:string;
    time: "1 month" | "15 days" | "1 week" | "1 day"
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
  expense_categories!: EntityTable<ExpenseCategory, "id">;
  income_categories!: EntityTable<IncomeCategory, "id">;
  budgets!: EntityTable<Budget, "id">;

  constructor() {
    super("PennyWiseDB");

    this.version(1).stores({
      expenses: "++id, title, amount, currency, categoryId, account, date",
      incomes: "++id, currency, categoryId, date",
      expense_categories: "++id, name",
      income_categories: "++id, name",
      budgets: "++id, categoryId, date, time",
    });
  }
}

export const db = new PennyWiseDB();