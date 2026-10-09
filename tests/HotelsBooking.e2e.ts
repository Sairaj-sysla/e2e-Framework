
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import {
  addDays,
  configureRooms,
  expectPricesSorted,
  expectSearchResults,
  searchHotels,
  selectDestination,
  selectStayDates,
  sortResults,
  type Room,
} from './support/easemytripHotels.js';

const city = { name: 'Mumbai', subtitle: 'City In Maharashtra' };
const rooms: Room[] = [
  { adults: 2, childAges: [8] },
  { adults: 1, childAges: [] },
];

test(
  'HotelsBookingAndPrintingTheCosts - Hotels booking and cost validation',
  { tags: ['hotels', 'live'], timeout: 240_000 },
  async ({ app, agent, screen, browser }) => {
    
    const checkIn = addDays(new Date(), 30);
    const checkOut = addDays(checkIn, 1);

   
    await app.open('https://www.easemytrip.com/');
    await agent.act('Open the Hotels section from the main navigation');
    await expect(browser).toHaveURL(/easemytrip\.com\/hotels\/?(\?.*)?$/);
    await expect(screen.getByRole('button', { name: 'Search' })).toBeVisible();

  
    await selectDestination(screen, browser, city);
    await selectStayDates(browser, checkIn, checkOut);
    await configureRooms(browser, rooms);

    await searchHotels(screen, browser);

   
    await expectSearchResults(screen, browser, { city, checkIn, checkOut, rooms });
    await agent.assert('The page lists hotels in Mumbai, and each listed hotel shows a nightly price');

    await sortResults(screen, browser, 'Price High to Low');

    const prices = await expectPricesSorted(browser, 'descending', 5);
    expect(prices[0]).toMatch(/^₹\s?[\d,]+$/);
    console.log(`First displayed hotel price (High to Low): ${prices[0]}`);
  },
);
