import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Booking } from "./shared";

const chargingMonth = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: "Asia/Kolkata",
});
const monthLabel = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
const energyLabel = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 3,
});

export default function EnergyChart({ sessions }: { sessions: Booking[] }) {
  const monthly = new Map<string, number>();
  for (const session of sessions) {
    if (session.actualEnergyWh == null) continue;
    const parts = chargingMonth.formatToParts(new Date(session.start));
    const year = parts.find(({ type }) => type === "year")?.value;
    const month = parts.find(({ type }) => type === "month")?.value;
    const key = `${year}-${month}`;
    monthly.set(key, (monthly.get(key) ?? 0) + session.actualEnergyWh);
  }
  const data = [...monthly.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .slice(-6)
    .map(([month, wattHours]) => ({
      month: monthLabel.format(new Date(`${month}-01T00:00:00Z`)),
      kwh: wattHours / 1000,
    }));
  if (!data.length) return null;

  return (
    <figure className="db-energy">
      <figcaption>
        <h3>Delivered energy by month</h3>
        <p>
          Recorded energy from the latest months with completed sessions,
          grouped in Jaipur local time.
        </p>
      </figcaption>
      <ul className="db-visually-hidden">
        {data.map((item) => (
          <li key={item.month}>
            {item.month} — {energyLabel.format(item.kwh)} kWh
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="db-energy-chart">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart
            data={data}
            margin={{ left: 0, right: 8, top: 10 }}
            accessibilityLayer={false}
          >
            <CartesianGrid vertical={false} stroke="#dce6df" />
            <XAxis
              dataKey="month"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={55}
              unit=" kWh"
            />
            <Tooltip
              cursor={{ fill: "#eef7f1" }}
              formatter={(value) => [
                `${energyLabel.format(Number(value))} kWh`,
                "Delivered energy",
              ]}
            />
            <Bar
              dataKey="kwh"
              fill="#087443"
              radius={[6, 6, 0, 0]}
              maxBarSize={64}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
