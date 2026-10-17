"use client";

import { CURRENCY } from "@/currency";
import { db } from "@/db";
import { AVAILABLE_ICONS } from "@/ExpenseIcons";
import { INCOME_ICONS } from "@/IncomeIcons";
import { useLiveQuery } from "dexie-react-hooks";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import PieChart, { PIE_COLORS } from "@/components/charts/PieChart";
import LineChart from "@/components/charts/LineChart";

type Mode = "Expense" | "Income";
type Range = "all" | "month" | "15days" | "week";

const modes: { value: Mode; label: string }[] = [
  { value: "Expense", label: "Expenses" },
  { value: "Income", label: "Income" },
];

const ranges: { value: Range; label: string; days: number | null }[] = [
  { value: "all", label: "All", days: null },
  { value: "month", label: "1 Month", days: 30 },
  { value: "15days", label: "15 Days", days: 15 },
  { value: "week", label: "1 Week", days: 7 },
];

const withinDays = (date: string, days: number) => {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return new Date(`${date}T00:00:00`).getTime() >= cutoff.getTime();
};

const Card = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="rounded-2xl border border-gray-200 p-4 sm:p-5">
    <h2 className="mb-4 text-sm font-semibold text-gray-900">{title}</h2>
    {children}
  </section>
);

const shortDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

const fullDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const MAX_DATES = 16;

const Charts = () => {
  const [mode, setMode] = useState<Mode>("Expense");
  const [range, setRange] = useState<Range>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const incomes = useLiveQuery(() => db.incomes.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);

  const rangeDays = ranges.find((item) => item.value === range)?.days ?? null;
  const allRows = mode === "Expense" ? (expenses ?? []) : (incomes ?? []);
  const rows = rangeDays
    ? allRows.filter((row) => withinDays(row.date, rangeDays))
    : allRows;

  const { slices, total, symbol, centerLabel, linePoints, lineColor } =
    useMemo(() => {
      const groupTotals = new Map<string, number>();
      const currencyCount = new Map<string, number>();
      const dailyTotals = new Map<string, number>();

      if (mode === "Expense") {
        rows.forEach((row) => {
          const category =
            categories?.find((item) => item.id === row.categoryId)?.name ??
            "Uncategorized";
          groupTotals.set(category, (groupTotals.get(category) ?? 0) + row.amount);
        });
      } else {
        rows.forEach((row) => {
          const account = row.account
            ? (accounts?.find((item) => String(item.id) === row.account)?.name ??
              "Unknown account")
            : "Unknown account";
          groupTotals.set(account, (groupTotals.get(account) ?? 0) + row.amount);
        });
      }

      rows.forEach((row) => {
        currencyCount.set(row.currency, (currencyCount.get(row.currency) ?? 0) + 1);
        dailyTotals.set(row.date, (dailyTotals.get(row.date) ?? 0) + row.amount);
      });

      const currency =
        [...currencyCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
        "INR";

      const sorted = [...groupTotals.entries()].sort((a, b) => b[1] - a[1]);

      const dateKeys = [...dailyTotals.keys()].sort().slice(-MAX_DATES);

      return {
        slices: sorted.map(([name, value], index) => ({
          name,
          value,
          color: PIE_COLORS[index % PIE_COLORS.length],
        })),
        total: sorted.reduce((sum, [, value]) => sum + value, 0),
        symbol: CURRENCY[currency as keyof typeof CURRENCY]?.symbol ?? "",
        centerLabel: mode === "Expense" ? "Total spent" : "Total received",
        linePoints: dateKeys.map((date) => ({
          label: shortDate(date),
          value: dailyTotals.get(date) ?? 0,
          date,
        })),
        lineColor: mode === "Expense" ? "#ef4444" : "#16a34a",
      };
    }, [rows, categories, accounts, mode]);

  if (!expenses || !incomes || !categories || !accounts) {
    return <p className="p-6 text-gray-500">Loading charts...</p>;
  }

  const iconMap: Record<string, LucideIcon> = {};
  if (mode === "Expense") {
    categories.forEach((item) => {
      iconMap[item.name] = AVAILABLE_ICONS[item.icon] ?? AVAILABLE_ICONS.Ellipsis;
    });
  } else {
    accounts.forEach((item) => {
      iconMap[item.name] = INCOME_ICONS[item.icon] ?? INCOME_ICONS.Wallet;
    });
  }

  const changeMode = (value: Mode) => {
    setMode(value);
    setSelected(null);
    setSelectedPoint(null);
  };

  const changeRange = (value: Range) => {
    setRange(value);
    setSelectedPoint(null);
  };

  const activePoint =
    selectedPoint !== null ? linePoints[selectedPoint] ?? null : null;

  const dayBreakdown = (() => {
    if (!activePoint) return [];

    const totals = new Map<string, number>();

    rows
      .filter((row) => row.date === activePoint.date)
      .forEach((row) => {
        const name =
          mode === "Expense"
            ? categories.find((item) => item.id === row.categoryId)?.name ??
              "Uncategorized"
            : row.account
              ? accounts.find((item) => String(item.id) === row.account)?.name ??
                "Unknown account"
              : "Unknown account";

        totals.set(name, (totals.get(name) ?? 0) + row.amount);
      });

    const dayTotal = activePoint.value || 1;

    return [...totals.entries()]
      .map(([name, value]) => ({
        name,
        value,
        pct: (value / dayTotal) * 100,
      }))
      .sort((a, b) => b.value - a.value);
  })();

  const groupTitle = mode === "Expense" ? "category" : "account";

  return (
    <div className="relative mx-auto min-h-[70vh] w-full max-w-3xl px-4 pb-32 pt-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Charts</h1>
          <p className="mt-1 text-sm text-gray-500">
            {mode === "Expense"
              ? "Where your expenses go, by category."
              : "Where your income comes from, by account."}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-gray-600">
          <span>Show</span>
          <select
            value={mode}
            onChange={(e) => changeMode(e.target.value as Mode)}
            className="rounded-xl border border-gray-200 bg-white p-2 text-sm font-medium text-gray-900 outline-none focus:border-blue-500"
          >
            {modes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2 rounded-2xl bg-gray-100 p-1">
        {ranges.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => changeRange(item.value)}
            className={`rounded-xl p-2 text-xs font-medium transition sm:text-sm ${
              range === item.value
                ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {slices.length === 0 ? (
        <div className="mt-8 flex min-h-64 flex-col items-center justify-center text-center">
          <h2 className="text-lg font-semibold">
            No {mode === "Expense" ? "expenses" : "income"} yet
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Add a few{" "}
            {mode === "Expense" ? "expenses" : "income entries"} to see the
            breakdown.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <Card
            title={
              mode === "Expense"
                ? "Expenses by category"
                : "Income by account"
            }
          >
            <PieChart
              data={slices}
              total={total}
              symbol={symbol}
              centerLabel={centerLabel}
              selected={selected}
              onSelect={setSelected}
              icons={iconMap}
            />
          </Card>

          <Card title={`Totals by ${groupTitle}`}>
            <ul className="space-y-4">
              {slices.map((slice, index) => {
                const pct = (slice.value / total) * 100;
                const pctLabel =
                  pct >= 1 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
                const filled = pct >= 88;
                const SliceIcon = iconMap[slice.name];

                return (
                  <li key={slice.name}>
                    <div className="flex items-center gap-3">
                      <span className="w-5 shrink-0 text-center text-xs font-medium text-gray-400">
                        {index + 1}
                      </span>
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full"
                        style={{ backgroundColor: slice.color }}
                      />
                      {SliceIcon && (
                        <SliceIcon size={16} className="shrink-0 text-gray-500" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                        {slice.name}
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-gray-900">
                        {symbol}
                        {slice.value.toLocaleString()}
                      </span>
                    </div>

                    <div className="relative mt-1.5 ml-8 h-6 overflow-hidden rounded-lg bg-gray-100">
                      <div
                        className="h-full rounded-lg transition-all"
                        style={{
                          width: `${Math.max(pct, 1.5)}%`,
                          backgroundColor: slice.color,
                        }}
                      />
                      <span
                        className={`absolute inset-y-0 right-3 flex items-center text-xs font-semibold ${
                          filled ? "text-white" : "text-gray-600"
                        }`}
                      >
                        {pctLabel}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
              <span className="text-sm font-semibold text-gray-900">
                Total {mode === "Expense" ? "spent" : "received"}
              </span>
              <span className="text-base font-bold text-gray-900">
                {symbol}
                {total.toLocaleString()}
              </span>
            </div>
          </Card>

          {linePoints.length > 0 && (
            <Card
              title={
                mode === "Expense"
                  ? "Expenses by date"
                  : "Income by date"
              }
            >
              <LineChart
                data={linePoints}
                color={lineColor}
                selected={selectedPoint}
                onSelect={setSelectedPoint}
              />

              {activePoint && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-gray-900">
                      {fullDate(activePoint.date)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedPoint(null)}
                      className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-800"
                    >
                      Clear
                    </button>
                  </div>

                  <p className="mt-1 text-xs text-gray-500">
                    {mode === "Expense" ? "Total spent" : "Total received"}:{" "}
                    <span
                      className={`font-semibold ${
                        mode === "Expense" ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {symbol}
                      {activePoint.value.toLocaleString()}
                    </span>
                  </p>

                  {dayBreakdown.length > 0 && (
                    <ul className="mt-3 space-y-1.5 border-t border-gray-200 pt-3">
                      {dayBreakdown.map((item) => {
                        const pctLabel =
                          item.pct >= 1
                            ? `${Math.round(item.pct)}%`
                            : `${item.pct.toFixed(1)}%`;
                        const DayIcon = iconMap[item.name];

                        return (
                          <li
                            key={item.name}
                            className="flex items-center gap-2 text-sm"
                          >
                            {DayIcon && (
                              <DayIcon
                                size={15}
                                className="shrink-0 text-gray-400"
                              />
                            )}
                            <span className="min-w-0 flex-1 truncate text-gray-700">
                              {item.name}
                            </span>
                            <span className="shrink-0 text-xs text-gray-500">
                              {pctLabel}
                            </span>
                            <span className="w-20 shrink-0 text-right font-medium text-gray-900">
                              {symbol}
                              {item.value.toLocaleString()}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default Charts;
