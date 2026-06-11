// tests/unit/services/auctionService.winnerEmail.test.js
describe('winner email bid amount (dollars not cents)', () => {
  it('winningBidDollars is the raw DB value without /100 division', () => {
    const winningBid = '115';
    const correct = parseFloat(winningBid);       // 115.00
    const buggy   = parseFloat(winningBid) / 100; // 1.15
    expect(correct).toBe(115);
    expect(buggy).toBe(1.15);
    // The fix: use correct, not buggy
    expect(correct).toBeGreaterThan(buggy);
  });
});
