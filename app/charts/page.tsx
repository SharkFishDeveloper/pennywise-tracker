"use client";

import { CURRENCY } from "@/currency";
import { db, type Expense, type Income } from "@/db";
import { AVAILABLE_ICONS } from "@/ExpenseIcons";
import { INCOME_ICONS } from "@/IncomeIcons";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import PieChart, { PIE_COLORS } from "@/components/charts/PieChart";
import LineChart from "@/components/charts/LineChart";
import BarChart from "@/components/charts/BarChart";

type Mode = "Expense" | "Income";
type Range = "all" | "monthwise" | "month" | "15days" | "week";

const modes: { value: Mode; label: string }[] = [
  { value: "Expense", label: "Expenses" },
  { value: "Income", label: "Income" },
];

const ranges: { value: Range; label: string; days: number | null }[] = [
  { value: "all", label: "All", days: null },
  { value: "monthwise", label: "Monthly", days: null },
  { value: "month", label: "1 Month", days: 30 },
  { value: "15days", label: "15 Days", days: 15 },
  { value: "week", label: "1 Week", days: 7 },
];

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

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildDateSeries = (
  rows: { date: string }[],
  days: number | null,
  reference: Date | null
) => {
  if (days === null) {
    return [...new Set(rows.map((row) => row.date))].sort();
  }

  if (!reference) return [];

  const end = new Date(reference);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));

  const dates: string[] = [];
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    dates.push(toDateKey(cursor));
  }
  return dates;
};

const daysInMonth = (year: number, month0: number) =>
  new Date(year, month0 + 1, 0).getDate();

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const addDays = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

type ComparisonPeriod = {
  start: string;
  end: string;
  label: string;
  current: boolean;
};

const buildComparisonPeriods = (
  range: Range,
  today: Date
): ComparisonPeriod[] => {
  const anchor = startOfDay(today);
  const periods: ComparisonPeriod[] = [];

  if (range === "week") {
    for (let i = 0; i < 6; i += 1) {
      const end = addDays(anchor, -7 * i);
      const start = addDays(end, -6);
      const baseLabel = start.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      });
      periods.push({
        start: toDateKey(start),
        end: toDateKey(end),
        label: i === 0 ? `${baseLabel}*` : baseLabel,
        current: i === 0,
      });
    }
  } else if (range === "15days") {
    let year = anchor.getFullYear();
    let month0 = anchor.getMonth();
    let half = anchor.getDate() <= 15 ? 0 : 1;

    for (let i = 0; i < 6; i += 1) {
      const startDay = half === 0 ? 1 : 16;
      const endDay = half === 0 ? 15 : daysInMonth(year, month0);
      const start = new Date(year, month0, startDay);
      const end = i === 0 ? anchor : new Date(year, month0, endDay);
      const baseLabel = start.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      });

      periods.push({
        start: toDateKey(start),
        end: toDateKey(end),
        label: i === 0 ? `${baseLabel}*` : baseLabel,
        current: i === 0,
      });

      half -= 1;
      if (half < 0) {
        half = 1;
        month0 -= 1;
        if (month0 < 0) {
          month0 = 11;
          year -= 1;
        }
      }
    }
  } else {
    let year = anchor.getFullYear();
    let month0 = anchor.getMonth();

    for (let i = 0; i < 6; i += 1) {
      const start = new Date(year, month0, 1);
      const end = i === 0 ? anchor : new Date(year, month0 + 1, 0);
      const baseLabel = start.toLocaleDateString(undefined, {
        month: "short",
      });

      periods.push({
        start: toDateKey(start),
        end: toDateKey(end),
        label: i === 0 ? `${baseLabel}*` : baseLabel,
        current: i === 0,
      });

      month0 -= 1;
      if (month0 < 0) {
        month0 = 11;
        year -= 1;
      }
    }
  }

  return periods.reverse();
};

const tileDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const TransactionTiles = ({
  rows,
  groupName,
  mode,
  categoryNames,
  accountNames,
  Icon,
}: {
  rows: (Expense | Income)[];
  groupName: string;
  mode: Mode;
  categoryNames: Map<number, string>;
  accountNames: Map<string, string>;
  Icon: LucideIcon;
}) => (
  <div className="space-y-2">
    {rows.map((row, index) => {
      const isExpense = mode === "Expense";
      const categoryName = isExpense
        ? categoryNames.get(row.categoryId ?? -1) ?? "Uncategorized"
        : null;
      const accountName = row.account
        ? accountNames.get(row.account) ?? "Unknown account"
        : null;
      const subtitle = [categoryName, accountName].filter(Boolean).join(" · ");
      const symbol = CURRENCY[row.currency]?.symbol ?? "";

      return (
        <div
          key={`${row.date}-${index}`}
          className="flex w-full items-center gap-2.5 rounded-xl border border-gray-200 p-2.5"
        >
          <div
            className={`shrink-0 rounded-lg p-2 ${
              isExpense ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
            }`}
          >
            <Icon size={20} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {row.title || groupName}
            </p>
            <p className="truncate text-xs text-gray-500">
              {subtitle ? `${subtitle} · ` : ""}
              {tileDate(row.date)}
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
        </div>
      );
    })}
  </div>
);

const Charts = () => {
  const [mode, setMode] = useState<Mode>("Expense");
  const [range, setRange] = useState<Range>("all");
  const [lineOffset, setLineOffset] = useState(0);
  const [group, setGroup] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [today, setToday] = useState<Date | null>(null);

  useEffect(() => {
    setToday(new Date());
  }, []);

  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const incomes = useLiveQuery(() => db.incomes.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);

  const rangeDays = ranges.find((item) => item.value === range)?.days ?? null;
  const allRows = mode === "Expense" ? (expenses ?? []) : (incomes ?? []);
  const rows = (() => {
    if (range === "all") return allRows;
    if (!today) return [];

    if (range === "monthwise") {
      const monthStart = new Date(
        today.getFullYear(),
        today.getMonth() - lineOffset,
        1
      );
      const monthEnd = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        0
      );
      const start = toDateKey(monthStart);
      const end = toDateKey(monthEnd);
      return allRows.filter((row) => row.date >= start && row.date <= end);
    }

    if (rangeDays) {
      const end = startOfDay(today);
      end.setDate(end.getDate() - rangeDays * lineOffset);
      const start = addDays(end, -(rangeDays - 1));
      const startKey = toDateKey(start);
      const endKey = toDateKey(end);
      return allRows.filter(
        (row) => row.date >= startKey && row.date <= endKey
      );
    }

    return allRows;
  })();

  const {
    slices,
    total,
    symbol,
    centerLabel,
    linePoints,
    lineColor,
    lineWindowLabel,
    lineCanGoBack,
  } = useMemo(() => {
    const groupTotals = new Map<string, number>();
    const currencyCount = new Map<string, number>();

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
    });

    const currency =
      [...currencyCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "INR";

    const sorted = [...groupTotals.entries()].sort((a, b) => b[1] - a[1]);

    const totalsByDay = new Map<string, number>();

    allRows.forEach((row) => {
      totalsByDay.set(row.date, (totalsByDay.get(row.date) ?? 0) + row.amount);
    });

    const earliestDate = allRows.reduce<string | null>(
      (min, row) => (min === null || row.date < min ? row.date : min),
      null
    );

    let points: { label: string; value: number; date: string }[] = [];
    let windowLabel = "";
    let canGoBack = false;

    if (today) {
      if (range === "monthwise") {
        const monthStart = new Date(
          today.getFullYear(),
          today.getMonth() - lineOffset,
          1
        );
        const monthEnd = new Date(
          monthStart.getFullYear(),
          monthStart.getMonth() + 1,
          0
        );

        const dates = buildDateSeries(allRows, monthEnd.getDate(), monthEnd);
        points = dates.map((date) => ({
          label: shortDate(date),
          value: totalsByDay.get(date) ?? 0,
          date,
        }));

        windowLabel = monthStart.toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });
        canGoBack =
          earliestDate !== null && earliestDate < toDateKey(monthStart);
      } else if (rangeDays === null) {
        const dates = [...new Set(allRows.map((row) => row.date))].sort();
        points = dates.map((date) => ({
          label: shortDate(date),
          value: totalsByDay.get(date) ?? 0,
          date,
        }));
        windowLabel = "All dates";
      } else {
        const end = startOfDay(today);
        end.setDate(end.getDate() - rangeDays * lineOffset);

        const dates = buildDateSeries(allRows, rangeDays, end);
        points = dates.map((date) => ({
          label: shortDate(date),
          value: totalsByDay.get(date) ?? 0,
          date,
        }));

        const first = dates[0];
        const last = dates[dates.length - 1];
        if (first && last) {
          const startLabel = new Date(`${first}T00:00:00`).toLocaleDateString(
            undefined,
            { day: "numeric", month: "short" }
          );
          const endLabel = new Date(`${last}T00:00:00`).toLocaleDateString(
            undefined,
            { day: "numeric", month: "short", year: "numeric" }
          );
          windowLabel = `${startLabel} – ${endLabel}`;
          canGoBack = earliestDate !== null && earliestDate < first;
        }
      }
    }

    return {
      slices: sorted.map(([name, value], index) => ({
        name,
        value,
        color: PIE_COLORS[index % PIE_COLORS.length],
      })),
      total: sorted.reduce((sum, [, value]) => sum + value, 0),
      symbol: CURRENCY[currency as keyof typeof CURRENCY]?.symbol ?? "",
      centerLabel: mode === "Expense" ? "Total spent" : "Total received",
      linePoints: points,
      lineColor: mode === "Expense" ? "#ef4444" : "#16a34a",
      lineWindowLabel: windowLabel,
      lineCanGoBack: canGoBack,
    };
  }, [
    rows,
    allRows,
    categories,
    accounts,
    mode,
    range,
    rangeDays,
    today,
    lineOffset,
  ]);

  const groupNames = slices.map((slice) => slice.name);
  const activeGroup =
    group !== "all" && groupNames.includes(group) ? group : "all";

  const lineAverage =
    linePoints.length > 0
      ? linePoints.reduce((sum, point) => sum + point.value, 0) /
        linePoints.length
      : 0;

  const barPoints = useMemo(() => {
    if (activeGroup === "all") return [];

    const dailyTotals = new Map<string, number>();

    rows.forEach((row) => {
      const name =
        mode === "Expense"
          ? (categories?.find((item) => item.id === row.categoryId)?.name ??
            "Uncategorized")
          : row.account
            ? (accounts?.find((item) => String(item.id) === row.account)?.name ??
              "Unknown account")
            : "Unknown account";

      if (name !== activeGroup) return;

      dailyTotals.set(row.date, (dailyTotals.get(row.date) ?? 0) + row.amount);
    });

    const dateKeys = (() => {
      if (!rangeDays || !today) return buildDateSeries(rows, rangeDays, today);
      const end = startOfDay(today);
      end.setDate(end.getDate() - rangeDays * lineOffset);
      return buildDateSeries(rows, rangeDays, end);
    })();

    return dateKeys.map((date) => ({
      label: shortDate(date),
      value: dailyTotals.get(date) ?? 0,
      date,
    }));
  }, [rows, categories, accounts, mode, activeGroup, rangeDays, today, lineOffset]);

  const barTotal = barPoints.reduce((sum, point) => sum + point.value, 0);

  const barColor =
    slices.find(
      (slice) =>
        slice.name === (activeGroup !== "all" ? activeGroup : selected)
    )?.color ?? lineColor;

  if (!expenses || !incomes || !categories || !accounts || !today) {
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

  const categoryNameById = new Map<number, string>(
    categories.map((item) => [item.id ?? -1, item.name])
  );
  const accountNameById = new Map<string, string>(
    accounts.map((item) => [String(item.id), item.name])
  );

  const nameOf = (row: Expense | Income) =>
    mode === "Expense"
      ? categoryNameById.get(row.categoryId ?? -1) ?? "Uncategorized"
      : row.account
        ? accountNameById.get(row.account) ?? "Unknown account"
        : "Unknown account";

  const detailGroup = activeGroup !== "all" ? activeGroup : selected;
  const detailRows = detailGroup
    ? rows
        .filter((row) => nameOf(row) === detailGroup)
        .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
    : [];
  const detailIcon = detailGroup
    ? iconMap[detailGroup] ??
      (mode === "Expense" ? AVAILABLE_ICONS.Ellipsis : INCOME_ICONS.Wallet)
    : AVAILABLE_ICONS.Ellipsis;

  const comparisonPeriods =
    mode === "Expense" ? buildComparisonPeriods(range, today) : [];
  const comparisonHistory =
    mode === "Expense"
      ? detailGroup
        ? allRows.filter((row) => nameOf(row) === detailGroup)
        : allRows
      : [];
  const comparisonData = comparisonPeriods.map((period) => ({
    label: period.label,
    current: period.current,
    actual: comparisonHistory
      .filter((row) => row.date >= period.start && row.date <= period.end)
      .reduce((sum, row) => sum + row.amount, 0),
  }));
  const completedComparison = comparisonData.filter((point) => !point.current);
  const comparisonAverage =
    completedComparison.length > 0
      ? completedComparison.reduce((sum, point) => sum + point.actual, 0) /
        completedComparison.length
      : 0;
  const comparisonPoints = comparisonData.map((point) => ({
    label: point.label,
    actual: point.actual,
    expected: comparisonAverage,
  }));
  const hasComparisonData = comparisonPoints.some((point) => point.actual > 0);
  const comparisonUnit =
    range === "week"
      ? "weeks"
      : range === "15days"
        ? "15-day periods"
        : "months";
  const comparisonUnitSingular =
    range === "week"
      ? "week"
      : range === "15days"
        ? "15-day period"
        : "month";

  const changeMode = (value: Mode) => {
    setMode(value);
    setGroup("all");
    setSelected(null);
    setSelectedPoint(null);
    setLineOffset(0);
  };

  const changeRange = (value: Range) => {
    setRange(value);
    setSelectedPoint(null);
    setLineOffset(0);
  };

  const shiftLine = (direction: -1 | 1) => {
    setLineOffset((current) =>
      direction === 1 ? current + 1 : Math.max(0, current - 1)
    );
    setSelectedPoint(null);
  };

  const activePoint =
    selectedPoint !== null ? linePoints[selectedPoint] ?? null : null;

  const activePointLabel = activePoint ? fullDate(activePoint.date) : "";

  const dayBreakdown = (() => {
    if (!activePoint) return [];

    const totals = new Map<string, number>();

    allRows
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

      <div className="mt-5 grid grid-cols-5 gap-1.5 rounded-2xl bg-gray-100 p-1">
        {ranges.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => changeRange(item.value)}
            className={`rounded-xl px-1 py-2 text-[11px] font-medium leading-tight transition sm:text-sm ${
              range === item.value
                ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {slices.length > 0 && (
        <label className="mt-3 flex items-center gap-2 text-sm font-medium text-gray-600">
          <span className="shrink-0">
            {mode === "Expense" ? "Category" : "Account"}
          </span>
          <select
            value={activeGroup}
            onChange={(e) => {
              setGroup(e.target.value);
              setSelectedPoint(null);
            }}
            className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white p-2 text-sm font-medium text-gray-900 outline-none focus:border-blue-500"
          >
            <option value="all">
              All {mode === "Expense" ? "categories" : "accounts"}
            </option>
            {slices.map((slice) => (
              <option key={slice.name} value={slice.name}>
                {slice.name}
              </option>
            ))}
          </select>
        </label>
      )}

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
          {activeGroup === "all" ? (
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
          ) : (
            <Card title={`${activeGroup} over time`}>
              <BarChart
                data={barPoints}
                color={barColor}
                ariaLabel={`${activeGroup} ${mode.toLowerCase()} over time`}
              />

              <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
                <span className="text-sm font-semibold text-gray-900">
                  Total for {activeGroup}
                </span>
                <span className="text-base font-bold text-gray-900">
                  {symbol}
                  {barTotal.toLocaleString()}
                </span>
              </div>
            </Card>
          )}

          {detailGroup && detailRows.length > 0 && (
            <Card title={`${detailGroup} transactions`}>
              <TransactionTiles
                rows={detailRows}
                groupName={detailGroup}
                mode={mode}
                categoryNames={categoryNameById}
                accountNames={accountNameById}
                Icon={detailIcon}
              />
            </Card>
          )}

          {activeGroup === "all" && (
            <>
          {linePoints.length > 0 && (
            <Card
              title={
                mode === "Expense"
                  ? "Expenses by date"
                  : "Income by date"
              }
            >
              <div className="mb-3 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => shiftLine(1)}
                  disabled={!lineCanGoBack}
                  aria-label="Previous period"
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="min-w-0 flex-1 text-center text-xs font-medium text-gray-600">
                  {lineWindowLabel}
                </span>
                <button
                  type="button"
                  onClick={() => shiftLine(-1)}
                  disabled={lineOffset === 0}
                  aria-label="Next period"
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <LineChart
                data={linePoints}
                color={lineColor}
                selected={selectedPoint}
                onSelect={setSelectedPoint}
                average={lineAverage}
              />

              <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                <span className="text-xs font-medium text-gray-600">
                  Average {mode === "Expense" ? "spent" : "received"} per day
                </span>
                <span
                  className={`text-sm font-semibold ${
                    mode === "Expense" ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {symbol}
                  {lineAverage.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>

              {activePoint && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-gray-900">
                      {activePointLabel}
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
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Charts;
