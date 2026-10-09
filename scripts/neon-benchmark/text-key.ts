/**
 * Address keys and other text keys read out of untyped stage items and snapshot rows. A value that is not text is
 * a malformed record: it is rejected here instead of being coerced into a lookup key such as "[object Object]".
 */
export function textKey(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`Expected ${name} to be text`);
  return value;
}
