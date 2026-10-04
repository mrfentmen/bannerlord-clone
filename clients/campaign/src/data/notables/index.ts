/**
 * Notables index: imports all city roster files so their `addNotables`
 * calls register. Import this module once at startup.
 */

import "./denver.js";
import "./frontRange.js";
import "./newYork.js";
import "./westSouth.js";
import "./southEast.js";
import "./westCoast.js";
import "./northEast.js";
import "./finalBatch.js";
import "./newCities1.js";
import "./newCities2.js";
import "./newCities3.js";

export { CITY_NOTABLES, notablesForCity, totalNotableCount } from "../cityNotables.js";
export type { CityNotable } from "../cityNotables.js";
