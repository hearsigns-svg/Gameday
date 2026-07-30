import { headlineParticipant, namesPeople } from '../participants';

it('only combat sports name people', () => {
  expect(namesPeople('boxing')).toBe(true);
  expect(namesPeople('ufc')).toBe(true);
  expect(namesPeople('soccer')).toBe(false);
  expect(namesPeople('f1')).toBe(false);
});

it('extracts the headline fighter from real fixture titles', () => {
  expect(headlineParticipant('Rolando Romero vs Teofimo Lopez', 'boxing')).toBe(
    'Rolando Romero',
  );
  expect(
    headlineParticipant('UFC 330 Makhachev vs Machado Garry', 'ufc'),
  ).toBe('Makhachev');
  expect(
    headlineParticipant('UFC Fight Night 284 Gamrot vs Sadykhov', 'ufc'),
  ).toBe('Gamrot');
});

it('returns null when a title names no person', () => {
  expect(headlineParticipant('Liverpool v Everton', 'soccer')).toBeNull();
  expect(headlineParticipant('Dutch Grand Prix — Race', 'f1')).toBeNull();
  expect(headlineParticipant('UFC 330', 'ufc')).toBeNull();
});
