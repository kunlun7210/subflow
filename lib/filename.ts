import type { ClientTarget, GeneratedConfig } from "./model";

export function formatDownloadDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

export function configurationFilename(
  target: ClientTarget,
  extension: GeneratedConfig["extension"],
  date = new Date(),
): string {
  return `subflow-${target} ${formatDownloadDate(date)}.${extension}`;
}
