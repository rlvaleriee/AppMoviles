export function toLocalDateTimeString(tsLike) {
  const d =
    tsLike?.toDate?.() instanceof Date
      ? tsLike.toDate()
      : tsLike instanceof Date
      ? tsLike
      : new Date();
  return d.toLocaleString();
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
