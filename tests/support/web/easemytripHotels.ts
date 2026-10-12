// Reusable EaseMyTrip hotel-search steps. Each helper performs one part of the
// search form or results page and asserts the value the site then displays.
//
// The search widget has no accessible names for most controls, so these use
// the site's ids and classes; each selector was checked to match exactly one
// node (rooms, prices: one per card). Locators here cannot nest CSS, so card
// values are read through combined selectors such as '.listing-bx .htlprc'.
import type { Browser } from '@e2e-dev/web';
import type { Locator, Screen } from 'e2e';
import { expect } from 'e2e';

export interface Room {
  adults: number;
  childAges: number[];
}

export interface City {
  /** The suggestion's name, exactly as listed: 'Mumbai'. */
  name: string;
  /** The suggestion's subtitle, to tell same-named places apart: 'City In Maharashtra'. */
  subtitle: string;
}

export type SortOption = 'Popularity' | 'Price Low to High' | 'Price High to Low';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** A local calendar date `days` after `from`, time dropped. */
export function addDays(from: Date, days: number): Date {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  date.setDate(date.getDate() + days);
  return date;
}

/** '15/11/2026', as the results page shows dates. */
export const formatDdMmYyyy = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

/** '₹ 1,37,000' -> 137000. */
export const parsePrice = (text: string) => Number(text.replace(/[^\d]/g, ''));

/**
 * Closes the promotional modal (#zpopbox, e.g. "Easy Friday") that the Hotels
 * page shows on some loads over the search form. No-op when it is not shown.
 */
export async function dismissPromoPopup(browser: Browser): Promise<void> {
  const popup = browser.locator('#zpopbox');
  if (await popup.isVisible()) {
    await browser.locator('#zclosePopup').tap();
    await expect(popup).toBeHidden();
  }
}

/**
 * Opens the Hotels page from the home page's main navigation. The header link
 * is the only `a[href="/hotels/"]`; the role locator also matches a footer link.
 */
export async function openHotels(screen: Screen, browser: Browser): Promise<void> {
  await browser.locator('a[href="/hotels/"]').tap();
  await expect(browser).toHaveURL(/easemytrip\.com\/hotels\/?(\?.*)?$/);
  // The URL changes before the heavy page finishes loading; allow for the load.
  await expect(screen.getByRole('button', { name: 'Search' })).toBeVisible({ timeout: 30_000 });
}

export async function selectDestination(screen: Screen, browser: Browser, city: City): Promise<void> {
  await dismissPromoPopup(browser);
  await browser.locator('.htl_location').tap();
  const input = screen.getByRole('textbox', { name: 'Enter City Name, Location, or Specific hotel' });
  await input.clear();
  await input.pressSequentially(city.name, { delay: 50 });
  await screen
    .getByRole('listitem')
    .filter({ hasText: city.subtitle })
    .filter({ has: screen.getByText(city.name) })
    .tap();
  await expect(browser.locator('.htl_location .hp_city')).toHaveText(new RegExp(`^${city.name}$`, 'i'));
}

/**
 * Picks check-in and check-out in the jQuery UI calendar by year, month, and
 * a selectable day (no positional cell indexes), then checks what the form shows.
 */
export async function selectStayDates(browser: Browser, checkIn: Date, checkOut: Date): Promise<void> {
  const group = '#ui-datepicker-div .ui-datepicker-group-first';
  await dismissPromoPopup(browser);
  for (const [field, date] of [['#htl_dates', checkIn], ['#htl_dates1', checkOut]] as const) {
    if (await browser.locator('#ui-datepicker-div').isHidden()) await browser.locator(field).tap();
    await browser.locator(`${group} select.ui-datepicker-year`).selectOption({ label: String(date.getFullYear()) });
    await browser.locator(`${group} select.ui-datepicker-month`).selectOption({ label: MONTHS[date.getMonth()] });
    // Only selectable days carry data-handler="selectDay"; past or blocked days do not.
    const day = browser.locator(
      `xpath=//div[@id='ui-datepicker-div']//div[contains(@class,'ui-datepicker-group-first')]` +
        `//td[@data-handler='selectDay' and @data-month='${date.getMonth()}' and @data-year='${date.getFullYear()}']` +
        `/a[normalize-space()='${date.getDate()}']`,
    );
    if ((await day.count()) !== 1) {
      throw new Error(`${date.toDateString()} is not selectable in the EaseMyTrip calendar (blocked or out of range)`);
    }
    await day.tap();
  }
  const monthYear = (d: Date) => `${MONTHS[d.getMonth()]}'${d.getFullYear()}`;
  await expect(browser.locator('#txtcid')).toHaveText(String(checkIn.getDate()));
  await expect(browser.locator('#txtcimy')).toHaveText(monthYear(checkIn));
  await expect(browser.locator('#txtcod')).toHaveText(String(checkOut.getDate()));
  await expect(browser.locator('#txtcomy')).toHaveText(monthYear(checkOut));
}

/** Taps `+` or `-` until the counter shows `target`, then asserts it. */
async function setCounter(browser: Browser, id: string, target: number): Promise<void> {
  const value = browser.locator(`#${id}`);
  for (let i = 0; i < 10; i++) {
    const current = Number((await value.textContent())?.trim());
    if (current === target) break;
    await browser.locator(`#${id}_${current < target ? 'plus' : 'minus'}`).tap();
    await expect(value).toHaveText(String(current < target ? current + 1 : current - 1));
  }
  await expect(value).toHaveText(String(target));
}

/**
 * Sets up every room in the Rooms & Guests panel. Room ids follow the site's
 * pattern (Adults_room_2_2, Child_Age_2_1), verified for two rooms. A room
 * the site adds starts with 2 adults, so counts are set, not incremented.
 */
export async function configureRooms(browser: Browser, rooms: readonly Room[]): Promise<void> {
  await dismissPromoPopup(browser);
  if (await browser.locator('#divHotelPaxContent').isHidden()) await browser.locator('#divPaxPanel').tap();
  for (const [index, room] of rooms.entries()) {
    const r = index + 1;
    if (r > 1) await browser.locator('#addhotelRoom').tap();
    await setCounter(browser, `Adults_room_${r}_${r}`, room.adults);
    await setCounter(browser, `Children_room_${r}_${r}`, room.childAges.length);
    for (const [c, age] of room.childAges.entries()) {
      const select = browser.locator(`#Child_Age_${r}_${c + 1}`);
      await select.selectOption({ label: String(age) });
      await expect(select).toHaveValue(String(age));
    }
  }
  await browser.locator('#exithotelroom').tap();
  await expect(browser.locator('#guestroom')).toHaveText(String(rooms.length));
  await expect(browser.locator('#guestcount')).toHaveText(String(guestCount(rooms)));
}

const guestCount = (rooms: readonly Room[]) => rooms.reduce((n, room) => n + room.adults + room.childAges.length, 0);

/** Submits the search and waits for the results header. Returns that header. */
export async function searchHotels(screen: Screen, browser: Browser): Promise<Locator> {
  await screen.getByRole('button', { name: 'Search' }).tap();
  await browser.waitForURL(/\/hotel-new\/search\?/, { timeout: 60_000 });
  const heading = screen.getByRole('heading', { name: /Properties found/ });
  await expect(heading).toBeVisible({ timeout: 60_000 });
  return heading;
}

/**
 * Asserts the results page reflects the search: destination, dates, the
 * rooms-and-guests summary, the per-room guests and child ages (only visible
 * in the URL's pax parameter), and at least one listed property.
 * Returns the number of properties found.
 */
export async function expectSearchResults(
  screen: Screen,
  browser: Browser,
  search: { city: City; checkIn: Date; checkOut: Date; rooms: readonly Room[] },
): Promise<number> {
  const heading = screen.getByRole('heading', { name: /Properties found/ });
  await expect(heading).toContainText(search.city.name.toLowerCase());
  await expect(screen.getByRole('textbox', { name: 'Check-In Date' })).toHaveValue(formatDdMmYyyy(search.checkIn));
  await expect(screen.getByRole('textbox', { name: 'Check-out Date' })).toHaveValue(formatDdMmYyyy(search.checkOut));
  await expect(browser.locator('.guests_selected')).toHaveText(
    `${search.rooms.length} Room, ${guestCount(search.rooms)} Guests`,
  );
  // pax: rooms joined by '?' (%3F); a room is "adults", or "adults_children_age..." with children.
  const pax = search.rooms
    .map((room) => (room.childAges.length ? [room.adults, room.childAges.length, ...room.childAges].join('_') : String(room.adults)))
    .join('%3F');
  await expect(browser).toHaveURL(new RegExp(`[?&]Rooms=${search.rooms.length}&pax=${pax}(&|$)`));

  const found = Number((await heading.textContent())?.match(/([\d,]+)\s+Properties found/)?.[1].replace(/,/g, ''));
  expect(found, 'number of properties found').toBeGreaterThan(0);
  await expect(browser.locator('.listing-bx').first()).toBeVisible();
  return found;
}

/** Picks a sort option from the 'Sort Listing By' dropdown and checks it is applied. */
export async function sortResults(screen: Screen, browser: Browser, option: SortOption): Promise<void> {
  const current = browser.locator('.srtdrbx .drp-bx');
  await current.tap();
  await screen.getByRole('radio', { name: option }).tap();
  await expect(current).toHaveText(option);
}

/**
 * Waits until the first `count` hotel cards show positive prices in the given
 * order (results re-render after a sort), then returns the displayed price texts.
 */
export async function expectPricesSorted(
  browser: Browser,
  order: 'ascending' | 'descending',
  count = 5,
): Promise<string[]> {
  const prices = browser.locator('.listing-bx .htlprc');
  let texts: string[] = [];
  await expect
    .poll(
      async () => {
        texts = (await prices.allTextContents()).slice(0, count).map((t) => t.trim());
        const values = texts.map(parsePrice);
        return (
          values.length === count &&
          values.every((v, i) => v > 0 && (i === 0 || (order === 'descending' ? values[i - 1] >= v : values[i - 1] <= v)))
        );
      },
      { timeout: 30_000, message: `the first ${count} hotel prices are in ${order} order` },
    )
    .toBe(true);
  return texts;
}
