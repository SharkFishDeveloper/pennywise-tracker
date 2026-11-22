import { db } from "@/db";
import type {
  Accounts,
  Budget,
  Category,
  Expense,
  ExpenseCategory,
  Income,
  IncomeCategory,
  Recurrence,
} from "@/db";

export const AUTH_EVENT = "pennywise-auth";
export const SYNC_STATUS_EVENT = "pennywise-sync-status";
export const SYNC_FORCE_EVENT = "pennywise-sync-force";

export type Snapshot = {
  expenses: Expense[];
  incomes: Income[];
  accounts: Accounts[];
  categories: Category[];
  expense_categories: ExpenseCategory[];
  income_categories: IncomeCategory[];
  budgets: Budget[];
  recurrences: Recurrence[];
};

const TABLES = [
  "expenses",
  "incomes",
  "accounts",
  "categories",
  "expense_categories",
  "income_categories",
  "budgets",
  "recurrences",
] as const;

let applyingRemote = false;
let hooksRegistered = false;

export function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return TABLES.every((name) => Array.isArray(record[name]));
}

export function hasData(snapshot: Snapshot) {
  return TABLES.some((name) => snapshot[name].length > 0);
}

export async function readSnapshot(): Promise<Snapshot> {
  return db.transaction(
    "r",
    [
      db.expenses,
      db.incomes,
      db.accounts,
      db.categories,
      db.expense_categories,
      db.income_categories,
      db.budgets,
      db.recurrences,
    ],
    async () => ({
      expenses: await db.expenses.toArray(),
      incomes: await db.incomes.toArray(),
      accounts: await db.accounts.toArray(),
      categories: await db.categories.toArray(),
      expense_categories: await db.expense_categories.toArray(),
      income_categories: await db.income_categories.toArray(),
      budgets: await db.budgets.toArray(),
      recurrences: await db.recurrences.toArray(),
    }),
  );
}

export async function applySnapshot(snapshot: Snapshot) {
  applyingRemote = true;
  try {
    await db.transaction(
      "rw",
      [
        db.expenses,
        db.incomes,
        db.accounts,
        db.categories,
        db.expense_categories,
        db.income_categories,
        db.budgets,
        db.recurrences,
      ],
      async () => {
        for (const name of TABLES) {
          const table = db.table(name) as {
            clear: () => Promise<unknown>;
            bulkPut: (rows: unknown[]) => Promise<unknown>;
          };
          await table.clear();
          const rows = snapshot[name];
          if (rows.length) await table.bulkPut(rows);
        }
      },
    );
  } finally {
    applyingRemote = false;
  }
}

export async function clearLocalData() {
  applyingRemote = true;
  try {
    await db.transaction(
      "rw",
      [
        db.expenses,
        db.incomes,
        db.accounts,
        db.categories,
        db.expense_categories,
        db.income_categories,
        db.budgets,
        db.recurrences,
      ],
      async () => {
        for (const name of TABLES) {
          await db.table(name).clear();
        }
      },
    );
  } finally {
    applyingRemote = false;
  }
}

export function registerChangeHooks(onChange: () => void) {
  if (hooksRegistered) return;
  hooksRegistered = true;
  for (const name of TABLES) {
    const table = db.table(name) as {
      hook: (type: string, fn: () => void) => void;
    };
    for (const type of ["creating", "updating", "deleting"]) {
      table.hook(type, () => {
        if (!applyingRemote) onChange();
      });
    }
  }
}

export async function hashSnapshot(snapshot: Snapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
