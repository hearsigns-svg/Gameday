// The card-title parser, against the real corpus — plus rule-15
// attacks: event branding must never become an athlete.

import { participantsFromTitle } from '../providers/cardParticipants';

test('the real corpus parses to exactly the fighters', () => {
  expect(participantsFromTitle('Ryan Garcia vs Conor Benn')).toEqual([
    'Ryan Garcia',
    'Conor Benn',
  ]);
  expect(
    participantsFromTitle('Moses Itauma vs Filip Hrgovic — time TBC'),
  ).toEqual(['Moses Itauma', 'Filip Hrgovic']);
  expect(
    participantsFromTitle('Andy Ruiz Jr. vs Damian Knyba — time TBC'),
  ).toEqual(['Andy Ruiz Jr.', 'Damian Knyba']);
  expect(
    participantsFromTitle('Prime Video Boxing 16 Inoue vs Tenshin II — time TBC'),
  ).toEqual(['Inoue', 'Tenshin II']);
});

test('ATTACK: event branding and numerals never mint', () => {
  // The prefix words must not survive into the left name, and a
  // branding-only side rejects the whole title — a half-understood
  // title is not a minting licence.
  const prime = participantsFromTitle('Prime Video Boxing 16 Inoue vs Tenshin II');
  expect(prime.join(' ')).not.toMatch(/Prime|Video|Boxing|16/);
  expect(participantsFromTitle('Boxing 16 vs Card Night')).toEqual([]);
  expect(participantsFromTitle('Fight Night 12')).toEqual([]);
});

test('ATTACK: one-sided or vs-less titles yield nothing', () => {
  expect(participantsFromTitle('Wimbledon')).toEqual([]);
  expect(participantsFromTitle('vs Conor Benn')).toEqual([]);
  expect(participantsFromTitle('Ryan Garcia vs')).toEqual([]);
});

test('diacritics and separators survive as name characters', () => {
  expect(participantsFromTitle('Teófimo López vs Rolando Romero')).toEqual([
    'Teófimo López',
    'Rolando Romero',
  ]);
});
