import { db, type RecurrenceDuration } from "@/db";

export const RECURRENCE_DURATIONS: RecurrenceDuration[] = [
  "1 week",
  "2 weeks",
  "1 month",
  "6 months",
  "1 year",
];

export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const pad = (value: number) => String(value).padStart(2, "0");

export const toYMD = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parseYMD = (value: string) => new Date(`${value}T00:00:00`);

const nextDay = (value: string) => {
  const date = parseYMD(value);
  date.setDate(date.getDate() + 1);
  return toYMD(date);
};

const dayOfWeek = (value: string) => parseYMD(value).getDay();

export const durationEndDate = (
  start: string,
  duration: RecurrenceDuration
) => {
  const date = parseYMD(start);

  switch (duration) {
    case "1 week":
      date.setDate(date.getDate() + 7);
      break;
    case "2 weeks":
      date.setDate(date.getDate() + 14);
      break;
    case "1 month":
      date.setMonth(date.getMonth() + 1);
      break;
    case "6 months":
      date.setMonth(date.getMonth() + 6);
      break;
    case "1 year":
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return toYMD(date);
};

export const syncRecurrences = async (): Promise<number> => {
  const today = toYMD(new Date());
  let added = 0;

  await db.transaction("rw", db.expenses, db.recurrences, async () => {
    const recurrences = await db.recurrences.toArray();
    const expenses = await db.expenses.toArray();
    const taken = new Set(expenses.map((item) => `${item.categoryId}|${item.date}`));

    for (const rec of recurrences) {
      if (!rec.active || rec.id === undefined || rec.daysOfWeek.length === 0) {
        continue;
      }

      const from = rec.lastRun ? nextDay(rec.lastRun) : rec.startDate;
      const expired = rec.endDate < today;
      const until = expired ? rec.endDate : today;

      if (from > until) {
        if (expired) {
          await db.recurrences.update(rec.id, { active: false });
        }
        continue;
      }

      let cursor = from;
      while (cursor <= until) {
        if (rec.daysOfWeek.includes(dayOfWeek(cursor))) {
          const key = `${rec.categoryId}|${cursor}`;

          if (!taken.has(key)) {
            await db.expenses.add({
              title: null,
              amount: rec.amount,
              currency: rec.currency,
              categoryId: rec.categoryId,
              account: rec.account,
              date: cursor,
            });
            taken.add(key);
            added += 1;
          }
        }

        cursor = nextDay(cursor);
      }

      await db.recurrences.update(rec.id, {
        lastRun: until,
        active: !expired,
      });
    }
  });

  return added;
};
