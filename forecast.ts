import type { CurrencyCode } from "./currency";
import type { Expense } from "./db";

export type RecurringForecast = {
  categoryId: number;
  monthly: number;
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
  now: Date
): Forecast => {
  const currency = dominantCurrency(expenses);

  const year = now.getFullYear();
  const month0 = now.getMonth();
  const currentKey = `${year}-${pad(month0 + 1)}`;
  const daysThisMonth = daysInMonth(year, month0);
  const daysElapsed = now.getDate();
  const daysRemaining = Math.max(daysThisMonth - daysElapsed, 0);

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

  const categoryMonths = new Map<number, Set<string>>();
  expenses.forEach((item) => {
    const set = categoryMonths.get(item.categoryId) ?? new Set<string>();
    set.add(monthKey(item.date));
    categoryMonths.set(item.categoryId, set);
  });

  const recurringIds = new Set<number>();
  categoryMonths.forEach((months, id) => {
    if (months.size >= 2) recurringIds.add(id);
  });

  const pastMonthlyTotals = (id: number) =>
    pastKeys
      .map((key) =>
        (byMonth.get(key) ?? [])
          .filter((item) => item.categoryId === id)
          .reduce((sum, item) => sum + item.amount, 0)
      )
      .filter((total) => total > 0);

  const recurring: RecurringForecast[] = [...recurringIds].map((id) => {
    const paidAmount = current
      .filter((item) => item.categoryId === id)
      .reduce((sum, item) => sum + item.amount, 0);
    const totals = pastMonthlyTotals(id);
    const monthly =
      totals.length > 0
        ? totals.reduce((a, b) => a + b, 0) / totals.length
        : paidAmount;

    return {
      categoryId: id,
      monthly,
      paid: paidAmount > 0,
      paidAmount,
    };
  });

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
  const predictedRecurring = recurring
    .filter((item) => !item.paid)
    .reduce((sum, item) => sum + item.monthly, 0);
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
