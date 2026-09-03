import { Followable } from '../../data/followStore';
import { identityFollow } from '../followIdentity';

const f = (key: string, extra: Partial<Followable> = {}): Followable => ({
  key,
  label: key,
  sportKey: 'tennis',
  type: 'competition',
  ...extra,
});

test('a stored crest or colour owns identity, team follows first', () => {
  const team = f('fdorg-team-64', { type: 'team', brandColour: '#c00' });
  const comp = f('fdorg-comp-PL', { crestUrl: 'https://pl.png' });
  expect(identityFollow(['fdorg-comp-PL', 'fdorg-team-64'], [comp, team])?.key).toBe('fdorg-team-64');
  expect(identityFollow(['fdorg-comp-PL'], [comp, team])?.key).toBe('fdorg-comp-PL');
});

test('a follow with neither stored crest nor colour owns nothing — unless the served art map has its mark (Round 7)', () => {
  const usOpen = f('tennis-t-us-open-w');
  expect(identityFollow(['tennis-wta', 'tennis-t-us-open', 'tennis-t-us-open-w'], [usOpen])).toBeUndefined();
  const served = (key: string) => key === 'tennis-t-us-open-w';
  expect(identityFollow(['tennis-wta', 'tennis-t-us-open', 'tennis-t-us-open-w'], [usOpen], served)?.key).toBe(
    'tennis-t-us-open-w',
  );
  // The predicate is asked about the FOLLOW key; a fixture carrying only other keys still owns nothing.
  expect(identityFollow(['tennis-atp-appearances'], [usOpen], served)).toBeUndefined();
});
