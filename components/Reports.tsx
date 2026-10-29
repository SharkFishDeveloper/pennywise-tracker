"use client";

import { CURRENCY, type CurrencyCode } from "@/currency";
import { db } from "@/db";
import { AVAILABLE_ICONS } from "@/ExpenseIcons";
import { computeForecast } from "@/forecast";
import { INCOME_ICONS } from "@/IncomeIcons";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plus,
  X,
  MoreVertical,
  FileUp,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Minus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Forecast from "@/components/Forecast";
import ImportExport from "@/components/ImportExport";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [calcActive, setCalcActive] = useState(false);
  const [calcBaseKey, setCalcBaseKey] = useState<string | null>(null);
  const [calcTotal, setCalcTotal] = useState(0);
  const [calcSign, setCalcSign] = useState<1 | -1>(1);
  const [calcApplied, setCalcApplied] = useState<Record<string, number>>({});
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  useEffect(() => {
    setNow(new Date());
  }, []);

  useEffect(
    () => () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    },
    []
  );

  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

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

  const hasDateFilter = Boolean(dateFrom || dateTo);

  const dateFilteredRows = rows.filter((row) => {
    if (dateFrom && row.date < dateFrom) return false;
    if (dateTo && row.date > dateTo) return false;
    return true;
  });

  const rangeLabel = !hasDateFilter
    ? ""
    : dateFrom && dateTo
    ? `Showing ${formatDate(dateFrom)} – ${formatDate(dateTo)}`
    : dateFrom
    ? `Showing from ${formatDate(dateFrom)}`
    : `Showing up to ${formatDate(dateTo)}`;

  const visibleRows = dateFilteredRows.filter(
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

  const monthKeys = monthGroups.map(([month]) => month);
  const currentMonthKey =
    selectedMonth && monthKeys.includes(selectedMonth)
      ? selectedMonth
      : monthKeys[0] ?? null;
  const currentMonthIndex = currentMonthKey
    ? monthKeys.indexOf(currentMonthKey)
    : -1;
  const currentGroup = currentMonthKey
    ? months.get(currentMonthKey) ?? []
    : [];

  const cancelCalc = () => {
    setCalcActive(false);
    setCalcBaseKey(null);
    setCalcTotal(0);
    setCalcSign(1);
    setCalcApplied({});
  };

  const startCalc = (row: ReportRow) => {
    setCalcActive(true);
    setCalcBaseKey(row.key);
    setCalcTotal(row.amount);
    setCalcSign(1);
    setCalcApplied({});
  };

  const handleCalcTap = (row: ReportRow) => {
    if (row.key === calcBaseKey) return;
    const existing = calcApplied[row.key];
    if (existing !== undefined) {
      setCalcTotal((total) => total - existing);
      setCalcApplied((prev) => {
        const next = { ...prev };
        delete next[row.key];
        return next;
      });
    } else {
      const delta = calcSign * row.amount;
      setCalcTotal((total) => total + delta);
      setCalcApplied((prev) => ({ ...prev, [row.key]: delta }));
    }
  };

  const startLongPress = (row: ReportRow) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      startCalc(row);
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const shiftMonth = (direction: "older" | "newer") => {
    if (currentMonthIndex < 0) return;
    const nextIndex =
      direction === "older" ? currentMonthIndex + 1 : currentMonthIndex - 1;
    if (nextIndex < 0 || nextIndex >= monthKeys.length) return;
    setSelectedMonth(monthKeys[nextIndex]);
    cancelCalc();
  };

  return (
    <div className="relative mx-auto min-h-[70vh] w-full max-w-3xl px-4 pb-32 pt-6 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Records</h1>
          <p className="mt-1 text-sm text-gray-500">
            All your income and expenses in one place.
          </p>
        </div>

        <div className="relative shrink-0">
          {menuOpen && (
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="More options"
            className="relative z-50 rounded-full p-2 text-gray-600 transition hover:bg-gray-100"
          >
            <MoreVertical size={22} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setImportOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50"
              >
                <FileUp size={16} /> Import / Export CSV
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 mb-2">
        <div className="flex w-full items-center gap-2">
          <div className="grid w-full grid-cols-4 gap-1 rounded-2xl bg-gray-100 p-1">
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setFilter(item);
                  setSelectedMonth(null);
                  cancelCalc();
                }}
                className={`rounded-xl px-2 py-1.5 text-xs font-medium transition sm:text-sm ${
                  filter === item
                    ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {hasDateFilter && (
            <p className="truncate text-xs text-gray-500">{rangeLabel}</p>
          )}
        </div>
        <div className="relative flex shrink-0 items-center gap-1.5">
          {calendarOpen && (
            <button
              type="button"
              aria-label="Close date filter"
              onClick={() => setCalendarOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
          )}
          <button
            type="button"
            onClick={() => setCalendarOpen((value) => !value)}
            aria-label="Filter by date range"
            aria-expanded={calendarOpen}
            className="relative z-50 shrink-0 rounded-full border border-gray-200 p-1.5 text-gray-600 transition hover:bg-gray-100 hover:text-blue-600"
          >
            <Calendar size={16} />
            {hasDateFilter && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" />
            )}
          </button>

          {calendarOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
              <p className="mb-3 text-sm font-semibold text-gray-900">
                Filter by date
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
                  From
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || getTodayString()}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setSelectedMonth(null);
                      cancelCalc();
                    }}
                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
                  To
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    max={getTodayString()}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setSelectedMonth(null);
                      cancelCalc();
                    }}
                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </label>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setSelectedMonth(null);
                    cancelCalc();
                  }}
                  disabled={!hasDateFilter}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarOpen(false)}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
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
        <div className="mx-auto w-full max-w-xl space-y-3">
          {(() => {
            const { income, expense } = sumByType(currentGroup);
            const net = income - expense;
            const symbol = CURRENCY[currentGroup[0].currency]?.symbol ?? "";

            return (
              <>
                <div className="flex items-center justify-between gap-3 px-1">
                  <div className="flex min-w-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => shiftMonth("older")}
                      disabled={currentMonthIndex >= monthKeys.length - 1}
                      aria-label="Previous month"
                      className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <h2 className="truncate text-sm font-semibold text-gray-900">
                      {currentMonthKey ? formatMonth(currentMonthKey) : ""}
                    </h2>
                    <button
                      type="button"
                      onClick={() => shiftMonth("newer")}
                      disabled={currentMonthIndex <= 0}
                      aria-label="Next month"
                      className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {calcActive ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setCalcSign((sign) => (sign === 1 ? -1 : 1))
                        }
                        aria-label={
                          calcSign === 1
                            ? "Switch to subtract"
                            : "Switch to add"
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:bg-gray-100"
                      >
                        {calcSign === 1 ? (
                          <Plus size={13} />
                        ) : (
                          <Minus size={13} />
                        )}
                      </button>
                      <span
                        className={`text-xl font-semibold ${
                          calcTotal >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {symbol}
                        {calcTotal < 0 ? "-" : "+"}
                        {Math.abs(calcTotal).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={cancelCalc}
                        aria-label="Cancel calculation"
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:bg-gray-100"
                      >
                        <ArrowLeft size={14} />
                      </button>
                    </div>
                  ) : (
                    <span
                      className={`text-xl font-semibold ${
                        net >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {symbol}
                      {net < 0 ? "-" : "+"}
                      {Math.abs(net).toLocaleString()}
                    </span>
                  )}
                </div>

                {calcActive && (
                  <p className="px-1 text-xs text-gray-500">
                    Tap tiles to add or subtract · tap +/− to switch
                  </p>
                )}

                <div className="space-y-2">
                  {currentGroup.map((row) => {
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
                    const isBase = calcActive && row.key === calcBaseKey;
                    const isApplied =
                      calcActive && calcApplied[row.key] !== undefined;

                    return (
                      <button
                        key={row.key}
                        type="button"
                        onPointerDown={() => startLongPress(row)}
                        onPointerUp={cancelLongPress}
                        onPointerLeave={cancelLongPress}
                        onPointerCancel={cancelLongPress}
                        onContextMenu={(event) => event.preventDefault()}
                        onClick={() => {
                          if (longPressTriggered.current) {
                            longPressTriggered.current = false;
                            return;
                          }
                          if (calcActive) {
                            handleCalcTap(row);
                            return;
                          }
                          setEditingRow(row);
                          setEditorOpen(true);
                        }}
                        className={`flex w-full select-none items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${
                          isBase
                            ? "border-blue-400 bg-blue-50 ring-1 ring-blue-400"
                            : isApplied
                            ? "border-blue-200 bg-blue-50/60"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
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
              </>
            );
          })()}
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

      <ImportExport open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
};

export default Reports;
