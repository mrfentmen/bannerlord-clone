/**
 * Treasury 30-day forecast (Rowan solo task 78).
 *
 * Project the treasury 30 days out from recurring daily income and
 * expenses: day-by-day balances, the lowest point, and whether the
 * treasury goes broke before the month ends. The `chart` is a simple
 * ASCII sparkline the UI can render or replace.
 */

export interface ForecastLine {
  name: string;
  perDay: number;
}

export interface TreasuryForecast {
  startBalance: number;
  days: { day: number; balance: number }[];
  lowest: { day: number; balance: number };
  endBalance: number;
  brokeOnDay: number | null;
  /** ASCII sparkline of the balance curve. */
  chart: string;
  line: string;
}

/** Project `horizonDays` (default 30) of balances. */
export function forecastTreasury(
  startBalance: number,
  income: ForecastLine[],
  expenses: ForecastLine[],
  horizonDays = 30,
): TreasuryForecast {
  if (horizonDays < 1) throw new Error("horizon must be at least 1 day");
  const netPerDay = income.reduce((s, l) => s + l.perDay, 0) - expenses.reduce((s, l) => s + l.perDay, 0);
  const days: { day: number; balance: number }[] = [];
  let balance = startBalance;
  let brokeOnDay: number | null = null;
  for (let day = 1; day <= horizonDays; day++) {
    balance = Math.round(balance + netPerDay);
    days.push({ day, balance });
    if (brokeOnDay == null && balance < 0) brokeOnDay = day;
  }
  const lowest = days.reduce((a, b) => (b.balance < a.balance ? b : a));
  const bars = "▁▂▃▄▅▆▇█";
  const min = Math.min(...days.map((d) => d.balance), startBalance);
  const max = Math.max(...days.map((d) => d.balance), startBalance);
  const chart =
    max === min
      ? (bars[3] ?? "▄").repeat(horizonDays)
      : days
          .map((d) => bars[Math.min(7, Math.floor(((d.balance - min) / (max - min)) * 7))] ?? "▄")
          .join("");
  const line =
    brokeOnDay != null
      ? `Treasury goes broke on day ${brokeOnDay} (net ${netPerDay}/day). Cut expenses or find income now.`
      : `Treasury holds for ${horizonDays} days: ${startBalance} → ${days[days.length - 1]!.balance} (net ${netPerDay}/day).`;
  return {
    startBalance,
    days,
    lowest,
    endBalance: days[days.length - 1]!.balance,
    brokeOnDay,
    chart,
    line,
  };
}
