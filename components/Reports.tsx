"use client";

import { CURRENCY, type CurrencyCode } from "@/currency";
import { db } from "@/db";
import { AVAILABLE_ICONS } from "@/ExpenseIcons";
import { computeForecast } from "@/forecast";
import { INCOME_ICONS } from "@/IncomeIcons";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import Forecast from "@/components/Forecast";
import Transaction from "@/components/Transaction";

type Filter = "All" | "Expense" | "Income" | "Estimate";

type ReportRow = {
  key: string;
  id: number;
  type: "Expense" | "Income";
  title: string | null;
  amount: number;
  currency: CurrencyCode;
  categoryId: number | null;
  account: string | null;
  date: string;
};

const filters: Filter[] = ["All", "Expense", "Income", "Estimate"];

const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const formatMonth = (value: string) =>
  new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

const sumByType = (rows: ReportRow[]) =>
  rows.reduce(
    (acc, row) => {
      if (row.type === "Expense") acc.expense += row.amount;
      else acc.income += row.amount;
      return acc;
    },
    { income: 0, expense: 0 }
  );

const Reports = () => {
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const incomes = useLiveQuery(() => db.incomes.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const recurrences = useLiveQuery(() => db.recurrences.toArray(), []);

  const [filter, setFilter] = useState<Filter>("All");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ReportRow | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, []);

  if (!expenses || !incomes || !categories || !accounts || !recurrences) {
    return <p className="p-6 text-gray-500">Loading your records...</p>;
  }

  const categoryNames = new Map(categories.map((item) => [item.id, item.name]));
  const categoryIcons = new Map(categories.map((item) => [item.id, item.icon]));
  const accountNames = new Map(accounts.map((item) => [String(item.id), item.name]));
  const accountIcons = new Map(accounts.map((item) => [String(item.id), item.icon]));

  const rows: ReportRow[] = [
    ...expenses.map((item) => ({
      key: `expense-${item.id}`,
      id: item.id!,
      type: "Expense" as const,
      title: item.title,
      amount: item.amount,
      currency: item.currency,
      categoryId: item.categoryId,
      account: item.account,
      date: item.date,
    })),
    ...incomes.map((item) => ({
      key: `income-${item.id}`,
      id: item.id!,
      type: "Income" as const,
      title: item.title,
      amount: item.amount,
      currency: item.currency,
      categoryId: item.categoryId,
      account: item.account ?? null,
      date: item.date,
    })),
  ].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

  const visibleRows = rows.filter(
    (row) => filter === "All" || row.type === filter
  );

  const months = new Map<string, ReportRow[]>();
  visibleRows.forEach((row) => {
    const key = row.date.slice(0, 7);
    const group = months.get(key);
    if (group) group.push(row);
    else months.set(key, [row]);
  });

  const monthGroups = [...months.entries()].sort((a, b) =>
    a[0] < b[0] ? 1 : -1
  );

  const forecast =
    filter === "Estimate" && now
      ? computeForecast(expenses, recurrences, now)
      : null;

  return (
    <div className="relative mx-auto min-h-[70vh] w-full max-w-3xl px-4 pb-32 pt-6 sm:px-6">
      <h1 className="text-2xl font-bold">Records</h1>
      <p className="mt-1 text-sm text-gray-500">
        All your income and expenses in one place.
      </p>

      <div className="mt-5 grid grid-cols-4 gap-2 rounded-2xl bg-gray-100 p-1 mb-2">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`rounded-xl p-2 text-sm font-medium transition ${
              filter === item
                ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {forecast ? (
        <Forecast
          forecast={forecast}
          now={now as Date}
          categoryNames={categoryNames}
          categoryIcons={categoryIcons}
        />
      ) : visibleRows.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center text-center">
          <div className="mb-4 rounded-2xl bg-gray-100 p-4">
            <AVAILABLE_ICONS.Wallet size={32} className="text-gray-500" />
          </div>
          <h2 className="text-lg font-semibold">No records yet</h2>
          <p className="mt-1 text-sm text-gray-500">
            Tap + to add your first transaction.
          </p>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-xl space-y-8">
          {monthGroups.map(([month, group]) => {
            const { income, expense } = sumByType(group);
            const net = income - expense;
            const symbol = CURRENCY[group[0].currency]?.symbol ?? "";

            return (
              <div key={month}>
                <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
                  <h2 className="text-sm font-semibold text-gray-900">
                    {formatMonth(month)}
                  </h2>
                  <span
                    className={`text-xs font-semibold ${
                      net >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {symbol}
                    {net < 0 ? "-" : "+"}
                    {Math.abs(net).toLocaleString()}
                  </span>
                </div>

                <div className="space-y-2">
                  {group.map((row) => {
                    const isExpense = row.type === "Expense";
                    const categoryName = isExpense
                      ? categoryNames.get(row.categoryId ?? -1) ?? "Uncategorized"
                      : null;
                    const accountName = row.account
                      ? accountNames.get(row.account) ?? "Unknown account"
                      : null;
                    const RowIcon = isExpense
                      ? AVAILABLE_ICONS[
                          categoryIcons.get(row.categoryId ?? -1) ?? "Ellipsis"
                        ] ?? AVAILABLE_ICONS.Ellipsis
                      : INCOME_ICONS[accountIcons.get(row.account ?? "") ?? "Wallet"];
                    const subtitle = [categoryName, accountName]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <button
                        key={row.key}
                        type="button"
                        onClick={() => {
                          setEditingRow(row);
                          setEditorOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl border border-gray-200 p-2.5 text-left transition hover:bg-gray-50"
                      >
                        <div
                          className={`shrink-0 rounded-lg p-2 ${
                            isExpense
                              ? "bg-red-50 text-red-600"
                              : "bg-green-50 text-green-600"
                          }`}
                        >
                          <RowIcon size={20} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {row.title || categoryName || accountName}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {subtitle ? `${subtitle} · ` : ""}
                            {formatDate(row.date)}
                          </p>
                        </div>

                        <p
                          className={`shrink-0 text-sm font-semibold ${
                            isExpense ? "text-red-600" : "text-green-600"
                          }`}
                        >
                          {isExpense ? "-" : "+"}
                          {symbol}
                          {row.amount.toLocaleString()}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setEditingRow(null);
          setEditorOpen(true);
        }}
        aria-label="Add transaction"
        className="fixed bottom-24 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:scale-105 hover:bg-blue-700"
      >
        <Plus size={24} />
      </button>

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
            <div className="sticky top-0 flex justify-end bg-white/90 px-3 pt-3 backdrop-blur">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                aria-label="Close"
                className="rounded-full p-2 text-gray-600 hover:bg-gray-100"
              >
                <X size={22} />
              </button>
            </div>
            <Transaction
              key={editingRow?.key ?? "new"}
              transaction={editingRow}
              onSaved={() => setEditorOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
