/** @jest-environment jsdom */
const { pickGreeting } = require('../../../public/js/teacher-dashboard');

describe('pickGreeting', () => {
  test.each([
    [5, 'Good morning'], [9, 'Good morning'], [11, 'Good morning'],
    [12, 'Good afternoon'], [14, 'Good afternoon'], [16, 'Good afternoon'],
    [17, 'Good evening'], [20, 'Good evening'], [23, 'Good evening'],
    [0, 'Good evening'], [4, 'Good evening']
  ])('hour %i -> %s', (hour, expected) => {
    expect(pickGreeting(hour)).toBe(expected);
  });
});
