const { formatSchoolOption } = require('../../../public/js/school-combobox.js');

describe('formatSchoolOption', () => {
  test('name + city + state', () => {
    expect(formatSchoolOption({ name: 'Lincoln High School', city: 'Chicago', state_province: 'IL' }))
      .toBe('Lincoln High School — Chicago, IL');
  });

  test('name only when city and state are missing', () => {
    expect(formatSchoolOption({ name: 'Homeschool Co-op' })).toBe('Homeschool Co-op');
  });

  test('city without state', () => {
    expect(formatSchoolOption({ name: 'Reno Prep', city: 'Reno' })).toBe('Reno Prep — Reno');
  });

  test('trims surrounding whitespace', () => {
    expect(formatSchoolOption({ name: '  Reno Prep  ', city: ' Reno ', state_province: ' NV ' }))
      .toBe('Reno Prep — Reno, NV');
  });

  test('missing/blank name yields just the locality or empty', () => {
    expect(formatSchoolOption({ city: 'Reno', state_province: 'NV' })).toBe(' — Reno, NV');
    expect(formatSchoolOption({})).toBe('');
  });
});
