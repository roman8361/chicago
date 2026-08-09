function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return [
    `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`,
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
  ].join(" ");
}