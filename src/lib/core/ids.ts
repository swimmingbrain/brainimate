const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

// short random ids, 10 characters give plenty of room for one document
export function newId(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
