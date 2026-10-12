// E2E_HOTELS_001: search EaseMyTrip hotels in Mumbai for two rooms, check the
// results page reflects the search, sort by price (high to low), and print the
// top price.
//
// Fully deterministic: no model calls, no OPENROUTER_API_KEY needed.
// Live third-party site: EaseMyTrip answers 502 to headless browsers, so run
// it headed (npm run test:hotels). Tagged `live` so PR and CI suites skip it.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { CHECK_IN_DAYS_AHEAD, MUMBAI, NIGHTS, TWO_ROOMS_WITH_CHILD } from '../../../test-data/hotels.js';
import {
  addDays,
  configureRooms,
  expectPricesSorted,
  expectSearchResults,
  openHotels,
  searchHotels,
  selectDestination,
  selectStayDates,
  sortResults,
} from '../../support/web/easemytripHotels.js';

test(
  'E2E_HOTELS_001: search Mumbai hotels for two rooms and sort by price high to low',
  { tags: ['web', 'feature:hotels', 'regression', 'live', 'high'], requires: ['browser'], timeout: 240_000 },
  async ({ app, screen, browser }) => {
    const city = MUMBAI;
    const rooms = TWO_ROOMS_WITH_CHILD;
    const checkIn = addDays(new Date(), CHECK_IN_DAYS_AHEAD);
    const checkOut = addDays(checkIn, NIGHTS);

    // Step 1: open the Hotels page from the home page's main navigation.
    await app.open('https://www.easemytrip.com/');
    await openHotels(screen, browser);

    // Step 2: fill in the search form and submit it.
    await selectDestination(screen, browser, city);
    await selectStayDates(browser, checkIn, checkOut);
    await configureRooms(browser, rooms);
    await searchHotels(screen, browser);

    // Step 3: the results match the search (city, dates, rooms, guests, child ages).
    await expectSearchResults(screen, browser, { city, checkIn, checkOut, rooms });

    // Step 4: sort by price; the first five cards show prices in descending order.
    await sortResults(screen, browser, 'Price High to Low');
    const prices = await expectPricesSorted(browser, 'descending', 5);
    expect(prices[0]).toMatch(/^₹\s?[\d,]+$/);
    console.log(`First displayed hotel price (High to Low): ${prices[0]}`);
  },
);
