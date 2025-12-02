/**
 * Composable for managing pivot table configuration
 * Provides reactive configuration management for rows, columns, values, aggregators, and renderers
 * 
 * @example
 * ```javascript
 * import { usePivotConfig } from 'vue3-pivottable/composables';
 * 
 * const {
 *   rows,
 *   cols,
 *   vals,
 *   aggregatorNames,
 *   rendererName,
 *   updateConfig,
 *   resetConfig
 * } = usePivotConfig();
 * ```
 */

import { ref, computed, watch } from 'vue';

/**
 * Composable for managing pivot table configuration
 * @param {Object} options - Initial configuration options
 * @param {Array} options.initialRows - Initial row attributes
 * @param {Array} options.initialCols - Initial column attributes
 * @param {Array} options.initialVals - Initial value attributes
 * @param {Array|String} options.initialAggregatorNames - Initial aggregator name(s)
 * @param {String} options.initialRendererName - Initial renderer name
 * @param {Boolean} options.rowTotal - Show row totals (default: true)
 * @param {Boolean} options.colTotal - Show column totals (default: true)
 * @returns {Object} Reactive configuration and utility functions
 */
export function usePivotConfig(options = {}) {
	const {
		initialRows = [],
		initialCols = [],
		initialVals = [],
		initialAggregatorNames = ['Count'],
		initialRendererName = 'Table',
		rowTotal = true,
		colTotal = true,
	} = options;

	// Reactive configuration state
	const rows = ref([...initialRows]);
	const cols = ref([...initialCols]);
	const vals = ref([...initialVals]);
	const aggregatorNames = ref(
		Array.isArray(initialAggregatorNames) 
			? [...initialAggregatorNames] 
			: [initialAggregatorNames]
	);
	const rendererName = ref(initialRendererName);
	const showRowTotal = ref(rowTotal);
	const showColTotal = ref(colTotal);
	const valueFilter = ref({});
	const sorters = ref({});
	const derivedAttributes = ref({});

	/**
	 * Computed property for configuration hash
	 * Useful for caching or tracking configuration changes
	 */
	const configHash = computed(() => {
		return JSON.stringify({
			rows: rows.value,
			cols: cols.value,
			vals: vals.value,
			aggregatorNames: aggregatorNames.value,
			rendererName: rendererName.value,
			rowTotal: showRowTotal.value,
			colTotal: showColTotal.value,
		});
	});

	/**
	 * Check if configuration has any active fields
	 */
	const hasActiveFields = computed(() => {
		return rows.value.length > 0 || 
		       cols.value.length > 0 || 
		       vals.value.length > 0;
	});

	/**
	 * Update configuration
	 * @param {Object} config - Configuration object with properties to update
	 */
	const updateConfig = (config) => {
		if (config.rows !== undefined) rows.value = [...config.rows];
		if (config.cols !== undefined) cols.value = [...config.cols];
		if (config.vals !== undefined) vals.value = [...config.vals];
		if (config.aggregatorNames !== undefined) {
			aggregatorNames.value = Array.isArray(config.aggregatorNames)
				? [...config.aggregatorNames]
				: [config.aggregatorNames];
		}
		if (config.rendererName !== undefined) rendererName.value = config.rendererName;
		if (config.rowTotal !== undefined) showRowTotal.value = config.rowTotal;
		if (config.colTotal !== undefined) showColTotal.value = config.colTotal;
		if (config.valueFilter !== undefined) valueFilter.value = { ...config.valueFilter };
		if (config.sorters !== undefined) sorters.value = { ...config.sorters };
		if (config.derivedAttributes !== undefined) {
			derivedAttributes.value = { ...config.derivedAttributes };
		}
	};

	/**
	 * Reset configuration to initial values
	 */
	const resetConfig = () => {
		rows.value = [...initialRows];
		cols.value = [...initialCols];
		vals.value = [...initialVals];
		aggregatorNames.value = Array.isArray(initialAggregatorNames)
			? [...initialAggregatorNames]
			: [initialAggregatorNames];
		rendererName.value = initialRendererName;
		showRowTotal.value = rowTotal;
		showColTotal.value = colTotal;
		valueFilter.value = {};
		sorters.value = {};
		derivedAttributes.value = {};
	};

	/**
	 * Add a field to rows
	 * @param {String} fieldName - Name of the field to add
	 */
	const addRow = (fieldName) => {
		if (!rows.value.includes(fieldName)) {
			rows.value.push(fieldName);
		}
	};

	/**
	 * Remove a field from rows
	 * @param {String} fieldName - Name of the field to remove
	 */
	const removeRow = (fieldName) => {
		const index = rows.value.indexOf(fieldName);
		if (index > -1) {
			rows.value.splice(index, 1);
		}
	};

	/**
	 * Add a field to columns
	 * @param {String} fieldName - Name of the field to add
	 */
	const addCol = (fieldName) => {
		if (!cols.value.includes(fieldName)) {
			cols.value.push(fieldName);
		}
	};

	/**
	 * Remove a field from columns
	 * @param {String} fieldName - Name of the field to remove
	 */
	const removeCol = (fieldName) => {
		const index = cols.value.indexOf(fieldName);
		if (index > -1) {
			cols.value.splice(index, 1);
		}
	};

	/**
	 * Add a field to values
	 * @param {String} fieldName - Name of the field to add
	 */
	const addVal = (fieldName) => {
		if (!vals.value.includes(fieldName)) {
			vals.value.push(fieldName);
		}
	};

	/**
	 * Remove a field from values
	 * @param {String} fieldName - Name of the field to remove
	 */
	const removeVal = (fieldName) => {
		const index = vals.value.indexOf(fieldName);
		if (index > -1) {
			vals.value.splice(index, 1);
		}
	};

	/**
	 * Get current configuration as an object
	 * @returns {Object} Current configuration
	 */
	const getConfig = () => {
		return {
			rows: [...rows.value],
			cols: [...cols.value],
			vals: [...vals.value],
			aggregatorNames: [...aggregatorNames.value],
			rendererName: rendererName.value,
			rowTotal: showRowTotal.value,
			colTotal: showColTotal.value,
			valueFilter: { ...valueFilter.value },
			sorters: { ...sorters.value },
			derivedAttributes: { ...derivedAttributes.value },
		};
	};

	/**
	 * Export configuration as JSON string
	 * @returns {String} JSON string representation of configuration
	 */
	const exportConfig = () => {
		return JSON.stringify(getConfig(), null, 2);
	};

	/**
	 * Import configuration from JSON string
	 * @param {String} jsonString - JSON string representation of configuration
	 */
	const importConfig = (jsonString) => {
		try {
			const config = JSON.parse(jsonString);
			updateConfig(config);
		} catch (err) {
			console.error('Error importing configuration:', err);
			throw new Error('Invalid configuration JSON');
		}
	};

	return {
		// State
		rows,
		cols,
		vals,
		aggregatorNames,
		rendererName,
		showRowTotal,
		showColTotal,
		valueFilter,
		sorters,
		derivedAttributes,

		// Computed
		configHash,
		hasActiveFields,

		// Methods
		updateConfig,
		resetConfig,
		addRow,
		removeRow,
		addCol,
		removeCol,
		addVal,
		removeVal,
		getConfig,
		exportConfig,
		importConfig,
	};
}

