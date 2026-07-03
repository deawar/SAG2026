'use strict';

/**
 * Reduce a minor's name to a public-safe "First L." form.
 * Accepts either ("First", "Last") or a single "First Last" string.
 * A compound surname containing a space uses the FIRST surname word's initial
 * (e.g. "Van Der Berg" → "Van D.").
 */
function publicArtistName(first, last) {
  if (!first) { return ''; }
  let firstName = String(first).trim();
  let lastName = last ? String(last).trim() : '';
  if (!lastName && firstName.includes(' ')) {
    const parts = firstName.split(/\s+/);
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }
  if (!lastName) { return firstName; }
  return `${firstName} ${lastName.charAt(0).toUpperCase()}.`;
}

/** Remove winnerEmail from a single winner object (returns a copy). */
function stripWinnerEmail(winner) {
  if (!winner) { return winner; }
  const { winnerEmail, email, ...rest } = winner;
  return rest;
}

/** Remove winnerEmail from every winner in a list. */
function stripWinnerEmailList(list) {
  return Array.isArray(list) ? list.map(stripWinnerEmail) : list;
}

module.exports = { publicArtistName, stripWinnerEmail, stripWinnerEmailList };
