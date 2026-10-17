"use client";

import { CURRENCY } from "@/currency";
import { AVAILABLE_ICONS, type ExpenseIconName } from "@/ExpenseIcons";
import type { Forecast as ForecastData } from "@/forecast";
import { CalendarDays, Repeat } from "lucide-react";

const round = (value: number) => Math.round(value).toLocaleString();

const Forecast = ({
  forecast,
  now,
  categoryNames,
  categoryIcons,
}: {
  forecast: ForecastData;
  now: Date;
  categoryNames: Map<number | undefined, string>;
  categoryIcons: Map<number | undefined, ExpenseIconName>;
}) => {
  const symbol = CURRENCY[forecast.currency]?.symbol ?? "";
  const monthLabel = now.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const actualPct =
    forecast.forecastTotal > 0
      ? (forecast.actual / forecast.forecastTotal) * 100
      : 0;

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <section className="rounded-2xl border border-gray-200 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
            <CalendarDays size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              This month&apos;s forecast
            </h2>
            <p className="text-xs text-gray-500">{monthLabel}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 p-3">
            <p className="text-xs font-medium text-gray-500">Spent so far</p>
            <p className="mt-1 text-lg font-bold text-gray-900">
              {symbol}
              {round(forecast.actual)}
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-medium text-blue-600">
              Predicted remaining
            </p>
            <p className="mt-1 text-lg font-bold text-blue-700">
              {symbol}
              {round(forecast.predictedRemaining)}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500">
              Forecast total
            </p>
            <p className="mt-1 text-lg font-bold text-gray-900">
              {symbol}
              {round(forecast.forecastTotal)}
            </p>
          </div>
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full bg-blue-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${Math.min(Math.max(actualPct, 2), 100)}%` }}
          />
        </div>

        <p className="mt-2 text-xs text-gray-500">
          {forecast.daysRemaining > 0
            ? `${forecast.daysRemaining} of ${forecast.daysInMonth} days left`
            : "Month complete"}
          {forecast.historyMonths > 0
            ? ` · based on ${forecast.historyMonths} month${
                forecast.historyMonths === 1 ? "" : "s"
              } of history`
            : " · based on this month so far"}
        </p>
      </section>

      {forecast.recurring.length > 0 && (
        <section className="rounded-2xl border border-gray-200 p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Repeat size={16} className="text-gray-500" /> Recurring bills
          </h2>

          <ul className="space-y-2.5">
            {forecast.recurring.map((item) => {
              const name =
                categoryNames.get(item.categoryId) ?? "Uncategorized";
              const Icon =
                AVAILABLE_ICONS[categoryIcons.get(item.categoryId) ?? "Ellipsis"] ??
                AVAILABLE_ICONS.Ellipsis;

              return (
                <li
                  key={item.categoryId}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 p-2.5"
                >
                  <div className="shrink-0 rounded-lg bg-gray-100 p-2 text-gray-600">
                    <Icon size={18} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {symbol}
                      {round(item.amount)} each
                      {item.occurrences > 0
                        ? ` · ${item.occurrences} left`
                        : ""}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      item.paid
                        ? "bg-green-50 text-green-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {item.paid ? "Paid" : "Upcoming"}
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-xs text-gray-500">
            Fixed bills use your category schedules. Bills already logged this
            month are not counted again, and upcoming ones are added to the
            prediction.
          </p>
        </section>
      )}
    </div>
  );
};

export default Forecast;
