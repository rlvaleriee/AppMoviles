export function isValidEmail(email) {
  return typeof email === 'string' && /\S+@\S+\.\S+/.test(email);
}

export function isStrongPassword(pw) {
  return typeof pw === 'string' && pw.length >= 6;
}

export function requireFields(obj, fields) {
  const missing = fields.filter((f) => !obj?.[f]);
  return { ok: missing.length === 0, missing };
}
