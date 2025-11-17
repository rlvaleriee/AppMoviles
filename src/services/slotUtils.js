
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);

export const buildSlotsFromRanges = (baseDate, ranges = [], duration = 30) => {
  const toHM = (s) => String(s).split(':').map(n => parseInt(n, 10));
  const two = (n) => String(n).padStart(2, '0');

  const slots = [];
  for (const r of ranges) {
    if (!r?.start || !r?.end) continue;

    const [sh, sm] = toHM(r.start);
    const [eh, em] = toHM(r.end);

    const start = new Date(baseDate); start.setHours(sh, sm, 0, 0);
    const end   = new Date(baseDate); end.setHours(eh, em, 0, 0);

    let cur = new Date(start);
    while (addMinutes(cur, duration) <= end) {
      const next = addMinutes(cur, duration);
      slots.push({
        timeLabel: `${two(cur.getHours())}:${two(cur.getMinutes())}`,
        start: new Date(cur),
        end: next,
      });
      cur = next;
    }
  }
  return slots;
};