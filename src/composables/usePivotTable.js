/**
 * Composable for managing pivot table state and operations
 * @module usePivotTable
 */

import { ref, shallowRef, computed, watch } from 'vue';

/**
 * Composable for pivot table functionality
 * @param {Object} options - Configuration options
 * @param {Array} options.initialData - Initial data array
 * @param {Array} options.initialRows - Initial row fields
 * @param {Array} options.initialCols - Initial column fields
 * @param {Array} options.initialVals - Initial value fields
 * @param {Array} options.initialAggregatorNames - Initial aggregator names
 * @returns {Object} Pivot table state and methods
 */
export function usePivotTable(options = {}) {
	const {
		initialData = [],
		initialRows = [],
		initialCols = [],
		initialVals = [],
		initialAggregatorNames = ['Count', 'Sum'],
	} = options;

	// State
	const data = shallowRef(initialData);
	const rows = shallowRef(initialRows);
	const cols = shallowRef(initialCols);
	const vals = shallowRef(initialVals);
	const aggregatorNames = shallowRef(initialAggregatorNames);
	const showControlPanel = ref(true);

	// Computed
	const hasData = computed(() => Array.isArray(data.value) && data.value.length > 0);
	const dataSize = computed(() => (Array.isArray(data.value) ? data.value.length : 0));

	/**
	 * Reset all pivot table configuration
	 */
	const reset = () => {
		rows.value = [];
		cols.value = [];
		vals.value = [];
		aggregatorNames.value = ['Count', 'Sum'];
	};

	/**
	 * Set new data and reset configuration
	 * @param {Array} newData - New data array
	 */
	const setData = (newData) => {
		if (!Array.isArray(newData)) {
			console.warn('usePivotTable: setData expects an array');
			return;
		}
		// Reset configuration when new data is set
		rows.value = [];
		cols.value = [];
		data.value = newData;
	};

	/**
	 * Update row fields
	 * @param {Array} newRows - New row fields
	 */
	const setRows = (newRows) => {
		rows.value = Array.isArray(newRows) ? [...newRows] : [];
	};

	/**
	 * Update column fields
	 * @param {Array} newCols - New column fields
	 */
	const setCols = (newCols) => {
		cols.value = Array.isArray(newCols) ? [...newCols] : [];
	};

	/**
	 * Update value fields
	 * @param {Array} newVals - New value fields
	 */
	const setVals = (newVals) => {
		vals.value = Array.isArray(newVals) ? [...newVals] : [];
	};

	/**
	 * Update aggregator names
	 * @param {Array} newAggregatorNames - New aggregator names
	 */
	const setAggregatorNames = (newAggregatorNames) => {
		aggregatorNames.value = Array.isArray(newAggregatorNames) ? [...newAggregatorNames] : ['Count', 'Sum'];
	};

	/**
	 * Toggle control panel visibility
	 */
	const toggleControlPanel = () => {
		showControlPanel.value = !showControlPanel.value;
	};

	/**
	 * Get current configuration as an object
	 * @returns {Object} Current configuration
	 */
	const getConfig = () => ({
		data: data.value,
		rows: rows.value,
		cols: cols.value,
		vals: vals.value,
		aggregatorNames: aggregatorNames.value,
		showControlPanel: showControlPanel.value,
	});

	/**
	 * Set configuration from an object
	 * @param {Object} config - Configuration object
	 */
	const setConfig = (config) => {
		if (config.data !== undefined) setData(config.data);
		if (config.rows !== undefined) setRows(config.rows);
		if (config.cols !== undefined) setCols(config.cols);
		if (config.vals !== undefined) setVals(config.vals);
		if (config.aggregatorNames !== undefined) setAggregatorNames(config.aggregatorNames);
		if (config.showControlPanel !== undefined) showControlPanel.value = config.showControlPanel;
	};

	return {
		// State
		data,
		rows,
		cols,
		vals,
		aggregatorNames,
		showControlPanel,

		// Computed
		hasData,
		dataSize,

		// Methods
		reset,
		setData,
		setRows,
		setCols,
		setVals,
		setAggregatorNames,
		toggleControlPanel,
		getConfig,
		setConfig,
	};
}

