// The English catalog — the KEY AUTHORITY. Assembled from per-feature
// modules so each feature's strings live beside their owners; the
// merged object's type is the CatalogKey union every other language
// must satisfy in full.

import { coreStrings } from './en/core';
import { followsStrings } from './en/follows';
import { calendarStrings } from './en/calendar';
import { settingsStrings } from './en/settings';

export const en = {
  ...coreStrings,
  ...followsStrings,
  ...calendarStrings,
  ...settingsStrings,
} as const;
