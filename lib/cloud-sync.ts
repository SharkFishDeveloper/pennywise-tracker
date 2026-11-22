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

export function supportsCompression() {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

export type EncodedPayload = { compressed: string } | { payload: Snapshot };

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

export async function encodePayload(snapshot: Snapshot): Promise<EncodedPayload> {
  if (!supportsCompression()) return { payload: snapshot };
  const json = JSON.stringify(snapshot);
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return { compressed: toBase64(new Uint8Array(buffer)) };
}

export async function decodePayload(result: unknown): Promise<unknown> {
  if (!result || typeof result !== "object") return null;
  const record = result as { compressed?: unknown; payload?: unknown };
  if (typeof record.compressed === "string" && record.compressed) {
    if (!supportsCompression()) throw new Error("Compression is not supported");
    const binary = atob(record.compressed);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(stream).text();
    return JSON.parse(text) as unknown;
  }
  return record.payload ?? null;
}
