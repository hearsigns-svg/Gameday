import { boxingStampBases, MAJOR_CARDS_KEY, PBC_KEY, withMajorCardsKey } from '../boxingMerge';

describe('PBC → Major fight cards merge', () => {
  it('every PBC card also carries the Major fight cards key, once', () => {
    const out = withMajorCardsKey([
      { id: 'pbc-1', followKeys: [PBC_KEY] },
      { id: 'pbc-2', followKeys: [PBC_KEY, MAJOR_CARDS_KEY] },
    ]);
    expect(out[0].followKeys).toEqual([PBC_KEY, MAJOR_CARDS_KEY]);
    expect(out[1].followKeys).toEqual([PBC_KEY, MAJOR_CARDS_KEY]);
    // ids untouched — the ledger keys on them, so nothing moves
    expect(out.map((f) => f.id)).toEqual(['pbc-1', 'pbc-2']);
  });
  it('a PBC ingest stamps sex scopes for both bases; any other slice, its own only', () => {
    expect(boxingStampBases(PBC_KEY)).toEqual([PBC_KEY, MAJOR_CARDS_KEY]);
    expect(boxingStampBases(MAJOR_CARDS_KEY)).toEqual([MAJOR_CARDS_KEY]);
    expect(boxingStampBases('boxingdata-cards')).toEqual(['boxingdata-cards']);
  });
});
