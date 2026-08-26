export type AuctionBidResult = {
  feeAdjustedPrice: number;
  sellBid: number;
  sellTakeHome: number;
  sellDistribution: number;
  useBid: number;
  useDistribution: number;
};

export function calculateAuctionBid(
  price: number,
  participants: number,
): AuctionBidResult | null {
  if (
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    !Number.isSafeInteger(participants) ||
    participants < 2
  ) {
    return null;
  }

  const afterFee = price * 0.95;
  const participantRatio = (participants - 1) / participants;
  const sellBid = Math.round((afterFee * participantRatio) / 1.1);
  const useBid = Math.round(afterFee * participantRatio);

  return {
    feeAdjustedPrice: Math.round(afterFee),
    sellBid,
    sellTakeHome: Math.round(afterFee - sellBid),
    sellDistribution: Math.round(sellBid / (participants - 1)),
    useBid,
    useDistribution: Math.round(useBid / (participants - 1)),
  };
}
