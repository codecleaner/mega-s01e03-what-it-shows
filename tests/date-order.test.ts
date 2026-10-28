import assert from 'node:assert/strict';
import test from 'node:test';

import { dateHintForTenant, parseDateForTenant } from '../src/lib/kb/causes.ts';

const dayFirstV3 = {
  handle: 'alder.physio',
  name: 'Alder Physio',
  locale: 'de-DE',
  form: 'booking-v3' as const,
};

const monthFirstV3 = {
  handle: 'us.example',
  name: 'US Example',
  locale: 'en-US',
  form: 'booking-v3' as const,
};

test('booking-v3 uses a day-first hint for a day-first tenant', () => {
  assert.equal(dateHintForTenant(dayFirstV3), 'DD/MM/YYYY');
});

test('parser reads a day-first date in the tenant order', () => {
  assert.deepEqual(parseDateForTenant('04/07/2026', dayFirstV3), {
    year: 2026,
    month: 7,
    day: 4,
  });
});

test('parser keeps month-first order for a month-first tenant', () => {
  assert.deepEqual(parseDateForTenant('04/07/2026', monthFirstV3), {
    year: 2026,
    month: 4,
    day: 7,
  });
});
