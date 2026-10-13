/** Turns free text into a safe prefix tsquery: "cardi surg" -> "cardi:* & surg:*" */
export function tsQuery(input: string): string | null {
  const words = input.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 6);
  return words?.length ? words.map((w) => `${w}:*`).join(' & ') : null;
}
