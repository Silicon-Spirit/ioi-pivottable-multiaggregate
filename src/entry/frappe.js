/**
 * Frappe Framework Entry Point
 * This file provides integration with Frappe Framework
 */

import PivottableUi from "../components/PivottableUi.js";
import Pivottable from "../components/Pivottable.js";
import TableRenderer, { makeRenderer } from "../components/TableRenderer.js";
import { aggregators, aggregatorTemplates, derivers, locales, naturalSort, numberFormat, getSort, sortAs, PivotData } from "../utils/utils.js";

// Plugin for Vue 3
const VuePivottablePlugin = {
	install(app) {
		app.component('PivottableUi', PivottableUi);
		app.component('Pivottable', Pivottable);
	}
};

// Export for manual registration
export {
	PivottableUi,
	Pivottable,
	TableRenderer,
	makeRenderer,
	VuePivottablePlugin,
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

// Export plugin as default for convenience
// Note: When using named exports mode, import as: import { VuePivottablePlugin } from 'vue3-pivottable/frappe'
export { VuePivottablePlugin as default };

