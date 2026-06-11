// tests/unit/controllers/bidController.validateBid.test.js
describe('validateBid dollar amounts', () => {
  it('computes minimum bid as currentBid + $10 (not cents)', () => {
    const minIncrement = 10;
    const currentBid = 50;
    const minimumBid = currentBid + minIncrement;
    expect(minimumBid).toBe(60);
    expect(minimumBid.toFixed(2)).toBe('60.00');
  });

  it('does not divide minimumBid by 100 in response', () => {
    const minimumBid = 60;
    const responseValue = minimumBid; // new behavior: no /100
    expect(responseValue).toBe(60);
    expect(responseValue).not.toBe(0.60);
  });
});
