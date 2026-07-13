const KST_RESET_SHIFT_MS = 3 * 60 * 60 * 1000;

export const getRaidWeekKey = (now = new Date()) => {
  const shifted = new Date(now.getTime() + KST_RESET_SHIFT_MS);
  const daysSinceWednesday = (shifted.getUTCDay() - 3 + 7) % 7;
  shifted.setUTCDate(shifted.getUTCDate() - daysSinceWednesday);
  return shifted.toISOString().slice(0, 10);
};
