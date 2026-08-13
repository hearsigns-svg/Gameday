// The expanded card, paging laterally through its siblings.
//
// The carousel scrolls; the expanded view didn't — and a user who swiped
// between cards at the small size expects the same gesture at the big
// size. The pager mounts INSIDE the expansion overlay's animated
// container once the card is open, so the geometry machinery is
// untouched: the object that flew is the object that pages.
//
// Each page is a full FixtureCardBody — its own fetch, its own theme,
// its own controls. Pages are exactly the card's column width with
// paging enabled, so a swipe lands one fixture over, matching the
// carousel's physics rather than free-scrolling.
//
// HEIGHT FOLLOWS THE ACTIVE PAGE. The host sizes the card to its
// content (fittedFrame) and can re-target height late — its existing
// contract for bouts arriving after open. The pager reuses that per
// swipe: every page reports its measured height into a cache, and the
// moment a page becomes active its height is re-reported, so a
// two-control card shrinks and a twelve-bout card grows as you page.

import { useRef } from 'react';
import { Animated, FlatList, View } from 'react-native';
import { expandedFrame } from '../../../core/cardExpansion';
import { reportPagedTo } from '../openFixtureCard';
import { FixtureCardBody, FixtureCardPayload } from './FixtureCard';

export function FixtureCardPager(props: {
  payload: FixtureCardPayload;
  close: () => void;
  reveal: Animated.Value;
  onContentHeight: (h: number) => void;
}) {
  // Every origin is clamped to the card's column (openFixtureCard), so
  // the container's width is the column width from the first frame —
  // page geometry is knowable before anything has laid out.
  const pageWidth = expandedFrame().width;
  const ids = props.payload.pagerIds ?? [props.payload.fixtureId];
  const initialIndex = Math.max(0, ids.indexOf(props.payload.fixtureId));
  const activeIndex = useRef(initialIndex);
  const heights = useRef(new Map<number, number>());

  const reportHeight = (index: number, h: number) => {
    heights.current.set(index, h);
    if (index === activeIndex.current) props.onContentHeight(h);
  };

  return (
    <FlatList
      style={{ flex: 1 }}
      // Pages size themselves in percentages, so the row they sit in
      // must itself be bound to the list's (animated) height.
      contentContainerStyle={{ height: '100%' }}
      data={ids}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={initialIndex}
      // Fixed page geometry is what lets initialScrollIndex land without
      // measuring every earlier page first.
      getItemLayout={(_, index) => ({
        length: pageWidth,
        offset: pageWidth * index,
        index,
      })}
      // One page now, neighbours on the next frames: each page runs its
      // own fetch, and rendering ten siblings at open would fire ten.
      initialNumToRender={1}
      windowSize={3}
      maxToRenderPerBatch={2}
      keyExtractor={(id) => id}
      onMomentumScrollEnd={(e) => {
        const index = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
        if (index === activeIndex.current) return;
        activeIndex.current = index;
        // The collapse-home flight is only honest while the user is
        // still ON the card that was tapped (openFixtureCard).
        reportPagedTo(ids[index] ?? props.payload.fixtureId);
        const cached = heights.current.get(index);
        if (cached !== undefined) props.onContentHeight(cached);
      }}
      renderItem={({ item, index }) => (
        // The body's root fills its parent absolutely (PosterSurface),
        // so the page must have real dimensions of its own.
        <View style={{ width: pageWidth, height: '100%' }}>
          <FixtureCardBody
            payload={{ fixtureId: item }}
            close={props.close}
            reveal={props.reveal}
            onContentHeight={(h) => reportHeight(index, h)}
          />
        </View>
      )}
    />
  );
}
