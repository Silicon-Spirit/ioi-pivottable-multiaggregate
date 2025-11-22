// Main entry point for vue3-pivottable
import Pivottable from "../components/Pivottable.js";
import PivottableUi from "../components/PivottableUi.js";
import TableRenderer, { makeRenderer } from "../components/TableRenderer.js";
import { aggregators, aggregatorTemplates, derivers, locales, naturalSort, numberFormat, getSort, sortAs, PivotData } from "../utils/utils.js";

// Export main components
export { Pivottable, PivottableUi, TableRenderer, makeRenderer };

// Export utilities
export { aggregators, aggregatorTemplates, derivers, locales, naturalSort, numberFormat, getSort, sortAs, PivotData };

// Default export - export as named to avoid warnings
const Vue3Pivottable = {
	Pivottable,
	PivottableUi,
	TableRenderer,
	makeRenderer,
	aggregators,
	aggregatorTemplates,
	derivers,
	locales,
	naturalSort,
	numberFormat,
	getSort,
	sortAs,
	PivotData,
};

export { Vue3Pivottable as default };

