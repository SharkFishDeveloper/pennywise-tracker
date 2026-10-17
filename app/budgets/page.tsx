"use client";

import { CURRENCY, type CurrencyCode } from "@/currency";
import { db, type Budget } from "@/db";
import { AVAILABLE_ICONS } from "@/ExpenseIcons";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Plus, Pencil, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

type PeriodKey = "1 week" | "15 days" | "1 month" | "custom";

const periods: { value: PeriodKey; label: string }[] = [
  { value: "1 week", label: "1 Week" },
  { value: "15 days", label: "15 Days" },
  { value: "1 month", label: "1 Month" },
  { value: "custom", label: "Custom" },
];

const pad = (value: number) => String(value).padStart(2, "0");

const toYMD = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const todayYMD = () => toYMD(new Date());

const parseYMD = (value: string) => new Date(`${value}T00:00:00`);

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const periodEnd = (budget: Budget) => {
  const start = parseYMD(budget.date);
  switch (budget.time) {
    case "1 day":
      return addDays(start, 1);
    case "1 week":
      return addDays(start, 7);
    case "15 days":
      return addDays(start, 15);
    case "1 month":
      return addMonths(start, 1);
    default:
      return budget.endDate ? parseYMD(budget.endDate) : start;
  }
};

const periodLabel = (budget: Budget) =>
  budget.time === "custom"
    ? `${budget.date} → ${budget.endDate ?? budget.date}`
    : budget.time;

const Budgets = () => {
  const budgets = useLiveQuery(() => db.budgets.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("1 month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState("");

  const symbol = useMemo(() => {
    const counts = new Map<string, number>();
    expenses?.forEach((item) => {
      counts.set(item.currency, (counts.get(item.currency) ?? 0) + 1);
    });
    const top =
      [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "INR";
    return CURRENCY[top as CurrencyCode]?.symbol ?? "";
  }, [expenses]);

  const rows = useMemo(() => {
    if (!budgets) return [];

    const list = expenses ?? [];

    return budgets
      .map((budget) => {
        const startStr = budget.date;
        const endStr = toYMD(periodEnd(budget));
        const spent = list
          .filter(
            (item) =>
              item.categoryId === budget.categoryId &&
              item.date >= startStr &&
              item.date <= endStr
          )
          .reduce((sum, item) => sum + item.amount, 0);
        const remaining = budget.amount - spent;
        const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

        return {
          budget,
          startStr,
          endStr,
          spent,
          remaining,
          pct,
          exceeded: spent > budget.amount,
        };
      })
      .sort((a, b) => (a.startStr < b.startStr ? 1 : -1));
  }, [budgets, expenses]);

  if (budgets === undefined || expenses === undefined || categories === undefined) {
    return <p className="p-6 text-gray-500">Loading budgets...</p>;
  }

  const categoryNames = new Map(categories.map((item) => [item.id, item.name]));
  const categoryIcons = new Map(categories.map((item) => [item.id, item.icon]));
  const iconFor = (id: number | undefined) =>
    AVAILABLE_ICONS[categoryIcons.get(id ?? -1) ?? "Ellipsis"] ??
    AVAILABLE_ICONS.Ellipsis;

  const exceededRows = rows.filter((row) => row.exceeded);

  const openAddForm = () => {
    setEditingId(null);
    setCategoryId(categories[0]?.id ?? "");
    setAmount("");
    setPeriod("1 month");
    setStartDate(todayYMD());
    setEndDate(todayYMD());
    setMessage("");
    setIsEditing(true);
  };

  const openEditForm = (budget: Budget) => {
    setEditingId(budget.id ?? null);
    setCategoryId(budget.categoryId);
    setAmount(String(budget.amount));
    setPeriod(
      budget.time === "custom" || budget.time === "1 day"
        ? "custom"
        : budget.time
    );
    setStartDate(budget.date);
    setEndDate(budget.endDate ?? budget.date);
    setMessage("");
    setIsEditing(true);
  };

  const handleSave = async () => {
    const parsedAmount = Number(amount);

    if (categoryId === "") {
      setMessage("Please choose a category.");
      return;
    }

    if (!parsedAmount || parsedAmount <= 0) {
      setMessage("Please enter a valid amount.");
      return;
    }

    if (!startDate) {
      setMessage("Please choose a start date.");
      return;
    }

    if (period === "custom" && (!endDate || endDate < startDate)) {
      setMessage("The end date must be on or after the start date.");
      return;
    }

    const payload = {
      title: null,
      amount: parsedAmount,
      categoryId: categoryId as number,
      date: startDate,
      time: period as Budget["time"],
      ...(period === "custom" ? { endDate } : {}),
    };

    try {
      if (editingId !== null) {
        await db.budgets.update(editingId, payload);
      } else {
        await db.budgets.add(payload);
      }

      setIsEditing(false);
      setEditingId(null);
      setMessage("");
    } catch (error) {
      console.error("Failed to save budget:", error);
      setMessage("Could not save the budget. Please try again.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this budget?")) return;

    try {
      await db.budgets.delete(id);
    } catch (error) {
      console.error("Failed to delete budget:", error);
      setMessage("Could not delete the budget. Please try again.");
    }
  };

  return (
    <div className="relative mx-auto min-h-[70vh] w-full max-w-3xl px-4 pb-32 pt-6 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Budgets</h1>
          <p className="mt-1 text-sm text-gray-500">
            Set spending limits for your expense categories.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddForm}
          aria-label="Add budget"
          className="shrink-0 rounded-full bg-blue-600 p-3 text-white shadow-sm transition hover:bg-blue-700"
        >
          <Plus size={22} />
        </button>
      </div>

      {message && !isEditing && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"
        >
          {message}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center text-center">
          <div className="mb-4 rounded-2xl bg-gray-100 p-4">
            <AVAILABLE_ICONS.Wallet size={32} className="text-gray-500" />
          </div>
          <h2 className="text-lg font-semibold">No budgets yet</h2>
          <p className="mt-1 text-sm text-gray-500">
            Tap + to add your first budget.
          </p>
        </div>
      ) : (
        <>
          {exceededRows.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-600">
                <AlertTriangle size={16} /> Over budget
              </h2>

              <div className="space-y-3">
                {exceededRows.map(({ budget, spent, exceeded }) => {
                  const CategoryIcon = iconFor(budget.categoryId);
                  const extra = spent - budget.amount;

                  return (
                    <div
                      key={budget.id}
                      className="rounded-2xl border border-red-200 bg-red-50 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 rounded-xl bg-white p-2 text-red-600">
                          <CategoryIcon size={20} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-red-800">
                            {categoryNames.get(budget.categoryId) ??
                              "Uncategorized"}
                          </p>
                          <p className="truncate text-xs text-red-500">
                            {periodLabel(budget)}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-red-700">
                            +{symbol}
                            {Math.round(extra).toLocaleString()}
                          </p>
                          <p className="text-xs text-red-500">extra</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs font-medium text-red-700">
                        <span>
                          Spent {symbol}
                          {Math.round(spent).toLocaleString()}
                        </span>
                        <span>
                          Budget {symbol}
                          {budget.amount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              Your budgets
            </h2>

            <div className="space-y-3">
              {rows.map(({ budget, spent, remaining, pct, exceeded }) => {
                const CategoryIcon = iconFor(budget.categoryId);
                const pctLabel =
                  pct >= 1 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
                const barColor = exceeded
                  ? "#dc2626"
                  : pct >= 88
                    ? "#f59e0b"
                    : "#2563eb";

                return (
                  <div
                    key={budget.id}
                    className="rounded-2xl border border-gray-200 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`shrink-0 rounded-xl p-2 ${
                          exceeded
                            ? "bg-red-50 text-red-600"
                            : "bg-blue-50 text-blue-600"
                        }`}
                      >
                        <CategoryIcon size={20} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900">
                          {categoryNames.get(budget.categoryId) ??
                            "Uncategorized"}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {periodLabel(budget)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => openEditForm(budget)}
                        aria-label="Edit budget"
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                      >
                        <Pencil size={18} />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (budget.id !== undefined) {
                            void handleDelete(budget.id);
                          }
                        }}
                        aria-label="Delete budget"
                        className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="font-semibold text-gray-900">
                        {symbol}
                        {Math.round(spent).toLocaleString()}
                        <span className="font-normal text-gray-400">
                          {" "}
                          / {symbol}
                          {budget.amount.toLocaleString()}
                        </span>
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          exceeded ? "text-red-600" : "text-gray-500"
                        }`}
                      >
                        {exceeded
                          ? `${symbol}${Math.round(
                              Math.abs(remaining)
                            ).toLocaleString()} over`
                          : `${symbol}${Math.round(
                              remaining
                            ).toLocaleString()} left`}
                      </span>
                    </div>

                    <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(Math.max(pct, 2), 100)}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>

                    <p className="mt-1 text-right text-xs font-medium text-gray-400">
                      {pctLabel}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 text-gray-900 shadow-xl sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between gap-2">
              <h2 className="text-xl font-bold">
                {editingId !== null ? "Edit budget" : "Add budget"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setMessage("");
                }}
                aria-label="Close"
                className="rounded-full p-2 hover:bg-gray-100"
              >
                <X size={22} />
              </button>
            </div>

            <label htmlFor="budget-category" className="mb-2 block text-sm font-medium">
              Category
            </label>
            <div className="mb-5 flex items-center gap-2 rounded-xl border px-3 focus-within:border-blue-500">
              {categoryId !== "" &&
                (() => {
                  const SelectedIcon = iconFor(categoryId as number);
                  return <SelectedIcon size={18} className="shrink-0 text-gray-500" />;
                })()}
              <select
                id="budget-category"
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="w-full rounded-xl bg-transparent py-3 outline-none"
              >
                <option value="" disabled>
                  Select a category
                </option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <label htmlFor="budget-amount" className="mb-2 block text-sm font-medium">
              Amount
            </label>
            <div className="mb-5 flex items-center gap-2 rounded-xl border px-3 focus-within:border-blue-500">
              <span className="shrink-0 text-gray-500">{symbol}</span>
              <input
                id="budget-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                type="number"
                min="0"
                placeholder="0"
                className="w-full py-3 outline-none"
              />
            </div>

            <label htmlFor="budget-start" className="mb-2 block text-sm font-medium">
              Start date
            </label>
            <input
              id="budget-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mb-5 w-full rounded-xl border p-3 outline-none focus:border-blue-500"
            />

            <label htmlFor="budget-period" className="mb-2 block text-sm font-medium">
              Time period
            </label>
            <select
              id="budget-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodKey)}
              className="mb-5 w-full rounded-xl border bg-white p-3 outline-none focus:border-blue-500"
            >
              {periods.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            {period === "custom" && (
              <>
                <label htmlFor="budget-end" className="mb-2 block text-sm font-medium">
                  End date
                </label>
                <input
                  id="budget-end"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mb-5 w-full rounded-xl border p-3 outline-none focus:border-blue-500"
                />
              </>
            )}

            {message && (
              <p role="alert" className="mb-4 text-sm text-red-600">
                {message}
              </p>
            )}

            <button
              type="button"
              onClick={handleSave}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {editingId !== null ? "Save changes" : "Add budget"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Budgets;
