// Formatting helpers (display only, no energy calculations here)
export const fmt = (n, d = 1) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-IN", { maximumFractionDigits: d });
};

export function formatHour(h) {
  const hr = ((Number(h) % 24) + 24) % 24;
  const suffix = hr >= 12 ? "PM" : "AM";
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12}:00 ${suffix}`;
}

export const isDaylight = (h) => h >= 6 && h < 18;