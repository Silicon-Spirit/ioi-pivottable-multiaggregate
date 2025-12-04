// Main entry point for vue3-pivottable
import Pivottable from "../components/Pivottable.js";
import PivottableUi from "../components/PivottableUi.js";
import TableRenderer, { makeRenderer } from "../components/TableRenderer.js";
import { aggregators, aggregatorTemplates, derivers, locales, naturalSort, numberFormat, getSort, sortAs } from "../utils/utils.js";

// Export composables
export * from "../composables/index.js";

// Export helpers
export * from "../helpers/index.js";

// Export main components
export { Pivottable, PivottableUi, TableRenderer, makeRenderer };

// Export utilities
export { aggregators, aggregatorTemplates, derivers, locales, naturalSort, numberFormat, getSort, sortAs };

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

