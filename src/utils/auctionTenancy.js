/**
 * Tenant-isolation predicate for auction management.
 * SITE_ADMIN manages every school; SCHOOL_ADMIN manages only their own.
 * Pure — the caller loads the auction's school_id and passes it in.
 * @param {string} actorRole
 * @param {string|null|undefined} actorSchoolId
 * @param {string|null|undefined} auctionSchoolId
 * @returns {boolean}
 */
function schoolCanManage(actorRole, actorSchoolId, auctionSchoolId) {
  if (actorRole === 'SITE_ADMIN') { return true; }
  if (actorRole === 'SCHOOL_ADMIN') {
    return !!actorSchoolId && actorSchoolId === auctionSchoolId;
  }
  return false;
}

module.exports = { schoolCanManage };
