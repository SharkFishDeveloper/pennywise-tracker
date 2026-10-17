import type { CurrencyCode } from "./currency";
import type { Expense, Recurrence } from "./db";
import { countOccurrences, toYMD } from "./recurrence";

export type RecurringForecast = {
  categoryId: number;
  amount: number;
  occurrences: number;
  remaining: number;
  paid: boolean;
  paidAmount: number;
};

export type Forecast = {
  currency: CurrencyCode;
  actual: number;
  predictedRemaining: number;
  forecastTotal: number;
  dailyRate: number;
  daysElapsed: number;
  daysRemaining: number;
  daysInMonth: number;
  historyMonths: number;
  recurring: RecurringForecast[];
};

const pad = (value: number) => String(value).padStart(2, "0");

const daysInMonth = (year: number, month0: number) =>
  new Date(year, month0 + 1, 0).getDate();

const monthKey = (date: string) => date.slice(0, 7);

const monthKeyDays = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return daysInMonth(year, month - 1);
};

const dominantCurrency = (expenses: Expense[]): CurrencyCode => {
  const counts = new Map<CurrencyCode, number>();
  expenses.forEach((item) => {
    counts.set(item.currency, (counts.get(item.currency) ?? 0) + 1);
  });

  return (
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "INR"
  );
};

export const computeForecast = (
  expenses: Expense[],
  recurrences: Recurrence[],
  now: Date
): Forecast => {
  const currency = dominantCurrency(expenses);

  const year = now.getFullYear();
  const month0 = now.getMonth();
  const currentKey = `${year}-${pad(month0 + 1)}`;
  const monthStart = `${currentKey}-01`;
  const daysThisMonth = daysInMonth(year, month0);
  const daysElapsed = now.getDate();
  const daysRemaining = Math.max(daysThisMonth - daysElapsed, 0);
  const monthEnd = toYMD(new Date(year, month0 + 1, 0));
  const tomorrow = toYMD(new Date(year, month0, daysElapsed + 1));

  const byMonth = new Map<string, Expense[]>();
  expenses.forEach((item) => {
    const key = monthKey(item.date);
    const group = byMonth.get(key);
    if (group) group.push(item);
    else byMonth.set(key, [item]);
  });

  const current = byMonth.get(currentKey) ?? [];
  const actual = current.reduce((sum, item) => sum + item.amount, 0);

  const pastKeys = [...byMonth.keys()]
    .filter((key) => key < currentKey)
    .sort();
  const historyMonths = pastKeys.length;
  const pastDays = pastKeys.reduce((sum, key) => sum + monthKeyDays(key), 0);

  // Fixed bills come from the schedules the user set up on categories.
  const activeRecurrences = recurrences.filter(
    (rec) => rec.active && rec.endDate >= monthStart
  );
  const recurringIds = new Set(
    activeRecurrences.map((rec) => rec.categoryId)
  );

  const paidThisMonth = (categoryId: number) =>
    current
      .filter((item) => item.categoryId === categoryId)
      .reduce((sum, item) => sum + item.amount, 0);

  const recurring: RecurringForecast[] = activeRecurrences.map((rec) => {
    const occurrences = countOccurrences(rec, tomorrow, monthEnd);
    const paidAmount = paidThisMonth(rec.categoryId);

    return {
      categoryId: rec.categoryId,
      amount: rec.amount,
      occurrences,
      remaining: occurrences * rec.amount,
      paid: paidAmount > 0,
      paidAmount,
    };
  });

  // Everything that is not a fixed bill contributes to the daily average.
  const pastDiscretionary = pastKeys.reduce(
    (sum, key) =>
      sum +
      (byMonth.get(key) ?? [])
        .filter((item) => !recurringIds.has(item.categoryId))
        .reduce((acc, item) => acc + item.amount, 0),
    0
  );

  const currentDiscretionary = current
    .filter((item) => !recurringIds.has(item.categoryId))
    .reduce((sum, item) => sum + item.amount, 0);

  const dailyRate =
    historyMonths > 0 && pastDays > 0
      ? pastDiscretionary / pastDays
      : daysElapsed > 0
        ? currentDiscretionary / daysElapsed
        : 0;

  const predictedDiscretionary = dailyRate * daysRemaining;
  const predictedRecurring = recurring.reduce(
    (sum, item) => sum + item.remaining,
    0
  );
  const predictedRemaining = predictedDiscretionary + predictedRecurring;

  return {
    currency,
    actual,
    predictedRemaining,
    forecastTotal: actual + predictedRemaining,
    dailyRate,
    daysElapsed,
    daysRemaining,
    daysInMonth: daysThisMonth,
    historyMonths,
    recurring,
  };
};
