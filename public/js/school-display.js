/**
 * Populate and toggle a read-only "School" row.
 * Shows the row with the school name when present; hides it entirely otherwise.
 * Display-only — never an input, never submitted.
 * @param {HTMLElement|null} rowEl   - the row container (has `hidden` toggled)
 * @param {HTMLElement|null} valueEl - the element that holds the school name text
 * @param {string|null|undefined} schoolName
 */
function applySchoolRow(rowEl, valueEl, schoolName) {
  if (!rowEl || !valueEl) { return; }
  if (schoolName) {
    valueEl.textContent = schoolName;
    rowEl.hidden = false;
  } else {
    valueEl.textContent = '';
    rowEl.hidden = true;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applySchoolRow };
}
if (typeof window !== 'undefined') {
  window.applySchoolRow = applySchoolRow;
}
