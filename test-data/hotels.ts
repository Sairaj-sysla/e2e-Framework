// Hotel search inputs for the EaseMyTrip suite. Searches only read results,
// so parallel runs never share mutable state; dates are relative to today so
// the calendar always has them open.
import type { City, Room } from '../tests/support/web/easemytripHotels.js';

export const MUMBAI: City = { name: 'Mumbai', subtitle: 'City In Maharashtra' };

/** Two rooms: 2 adults with an 8-year-old child, and 1 adult. */
export const TWO_ROOMS_WITH_CHILD: Room[] = [
  { adults: 2, childAges: [8] },
  { adults: 1, childAges: [] },
];

/** Check-in this many days from today, for a one-night stay. */
export const CHECK_IN_DAYS_AHEAD = 30;
export const NIGHTS = 1;
