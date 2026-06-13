// tests/security/bidding.auth.test.js
describe('bid endpoints require authentication', () => {
  it('bid history route definition includes verifyToken', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/routes/biddingRoutes.js'),
      'utf8'
    );
    // After fix: verifyToken appears before the artwork history handler
    const historyRouteIdx = src.indexOf("'/artwork/:artworkId/history'");
    const verifyTokenIdx  = src.indexOf('verifyToken', historyRouteIdx);
    const nextRouteIdx    = src.indexOf('router.', historyRouteIdx + 1);
    expect(verifyTokenIdx).toBeGreaterThan(historyRouteIdx);
    expect(verifyTokenIdx).toBeLessThan(nextRouteIdx);
  });

  it('bidding state route definition includes verifyToken', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/routes/biddingRoutes.js'),
      'utf8'
    );
    const stateRouteIdx   = src.indexOf("'/artwork/:artworkId/state'");
    const verifyTokenIdx  = src.indexOf('verifyToken', stateRouteIdx);
    const nextRouteIdx    = src.indexOf('router.', stateRouteIdx + 1);
    expect(verifyTokenIdx).toBeGreaterThan(stateRouteIdx);
    expect(verifyTokenIdx).toBeLessThan(nextRouteIdx);
  });

  it('auction winner route definition includes verifyToken', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/routes/biddingRoutes.js'),
      'utf8'
    );
    const winnerRouteIdx  = src.indexOf("'/auction/:auctionId/winner'");
    const verifyTokenIdx  = src.indexOf('verifyToken', winnerRouteIdx);
    const nextRouteIdx    = src.indexOf('router.', winnerRouteIdx + 1);
    expect(verifyTokenIdx).toBeGreaterThan(winnerRouteIdx);
    expect(verifyTokenIdx).toBeLessThan(nextRouteIdx);
  });
});
