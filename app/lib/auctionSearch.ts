export function formatAuctionEngravingName(name: string) {
  const match = /^유물 (.+) 각인서$/u.exec(name.trim());
  return match?.[1] ?? name;
}

export function getAuctionHorizontalWheelDelta(
  deltaX: number,
  deltaY: number,
  ctrlKey = false,
) {
  if (ctrlKey || Math.abs(deltaX) >= Math.abs(deltaY)) return 0;
  return deltaY;
}
