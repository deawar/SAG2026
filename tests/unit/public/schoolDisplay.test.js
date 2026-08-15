/** @jest-environment jsdom */
const { applySchoolRow } = require('../../../public/js/school-display');

function setup() {
  document.body.innerHTML = '<div id="row" hidden><span id="val"></span></div>';
  return { row: document.getElementById('row'), val: document.getElementById('val') };
}

describe('applySchoolRow', () => {
  test('shows the row and sets the name when present', () => {
    const { row, val } = setup();
    applySchoolRow(row, val, 'Northview High School');
    expect(row.hidden).toBe(false);
    expect(val.textContent).toBe('Northview High School');
  });

  test('hides the row when the name is null/empty', () => {
    const { row, val } = setup();
    row.hidden = false;
    applySchoolRow(row, val, null);
    expect(row.hidden).toBe(true);
    expect(val.textContent).toBe('');
  });

  test('no-ops when elements are missing', () => {
    expect(() => applySchoolRow(null, null, 'X')).not.toThrow();
  });
});
