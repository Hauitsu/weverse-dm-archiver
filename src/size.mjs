// src/size.mjs -- one place decides how a number of bytes is written down.
//
// A 14 MB room used to be announced as "0.0 GB", which reads as if nothing had been saved, and a
// 2.5 GB room was announced as "2565.9 MB". So pick the unit from the magnitude instead, and always
// keep one decimal. The table lives inside the function on purpose: the window sends this function
// to the page with toString(), so it has to stand on its own.
export function fmtSize(bytes) {
  const n = Number(bytes);
  if (!isFinite(n) || n <= 0) return "0 B";
  const units = [["TB", 1099511627776], ["GB", 1073741824], ["MB", 1048576], ["KB", 1024]];
  for (const u of units) { if (n >= u[1] * 0.9995) return (n / u[1]).toFixed(1) + " " + u[0]; }
  return Math.round(n) + " B";
}
