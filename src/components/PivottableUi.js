import common from "../utils/defaultProps.js";
import DraggableAttribute from "./DraggableAttribute.js";
import Dropdown from "./Dropdown.js";
import Pivottable from "./Pivottable.js";
import { PivotData, getSort, aggregators, sortAs } from "../utils/utils.js";
import draggable from "vuedraggable";
import TableRenderer from "./TableRenderer.js";
import { h, shallowRef, computed, watch, nextTick, onUnmounted } from "vue";
import { pivotWorkerManager } from "../utils/pivotWorkerManager.js";
import "../styles/pivottable.css";

// Threshold for using Web Worker (records count)
const WORKER_THRESHOLD = 10000;

export default {
	name: "vue-pivottable-ui",
	props: {
		hiddenAttributes: {
			type: Array,
			default: function () {
				return [];
			},
		},
		hiddenFromAggregators: {
			type: Array,
			default: function () {
				return [];
			},
		},
		hiddenFromDragDrop: {
			type: Array,
			default: function () {
				return [];
			},
		},
		sortonlyFromDragDrop: {
			type: Array,
			default: function () {
				return [];
			},
		},
		disabledFromDragDrop: {
			type: Array,
			default: function () {
				return [];
			},
		},
		menuLimit: {
			type: Number,
			default: 500,
		},
		// Spread common props but exclude internal state props that are defined in data()
		...Object.fromEntries(
			Object.entries(common.props).filter(([key]) => 
				!['pivotResult', 'usePreCalculatedResult', 'isCalculating', 'calculationError'].includes(key)
			)
		),
	},
	computed: {
		renderers() {
			const translated_renderers = {};

			Object.keys(TableRenderer).forEach((key) => {
				translated_renderers[__(key)] = TableRenderer[key];
			});

			return translated_renderers;
		},
		selectedAggregators() {
			if (this.propsData.aggregatorNames && this.propsData.aggregatorNames.length) {
				return this.propsData.aggregatorNames;
			}
			if (Array.isArray(this.aggregatorNames) && this.aggregatorNames.length) {
				return this.aggregatorNames;
			}
			const preferredDefaults = [__("Count"), __("Sum")].filter((name) =>
				Object.keys(aggregators).includes(name)
			);
			if (preferredDefaults.length) {
				return preferredDefaults;
			}
			const fallback =
				this.propsData.aggregatorName ||
				(this.aggregatorName && !Array.isArray(this.aggregatorName)
					? this.aggregatorName
					: null) ||
				Object.keys(aggregators)[0];
			return fallback ? [fallback] : [];
		},
		availableAggregators() {
			return Object.keys(aggregators);
		},
		valueAttrOptions() {
			return Object.keys(this.attrValues.value || {})
				.filter(
					(attr) =>
						!this.hiddenAttributes.includes(attr) &&
						!this.hiddenFromAggregators.includes(attr)
				)
				.sort(sortAs(this.unusedOrder));
		},
		numValsAllowed() {
			const requiredInputs = this.selectedAggregators.reduce((largest, name) => {
				if (!aggregators[name]) {
					return largest;
				}
				const numInputs =
					aggregators[name]([])().numInputs || 0;
				return Math.max(largest, numInputs);
			}, 0);
			return requiredInputs;
		},
		rowAttrs() {
			return this.propsData.rows.filter(
				(e) =>
					!this.hiddenAttributes.includes(e) &&
					!this.hiddenFromDragDrop.includes(e)
			);
		},
		colAttrs() {
			return this.propsData.cols.filter(
				(e) =>
					!this.hiddenAttributes.includes(e) &&
					!this.hiddenFromDragDrop.includes(e)
			);
		},
		unusedAttrs() {
			return Object.keys(this.attrValues.value || {})
				.filter(
					(e) =>
						!this.propsData.rows.includes(e) &&
						!this.propsData.cols.includes(e) &&
						!this.hiddenAttributes.includes(e) &&
						!this.hiddenFromDragDrop.includes(e)
				)
				.sort(sortAs(this.unusedOrder));
		},
		// Computed property to unwrap attrValues for easier access
		attrValuesUnwrapped() {
			return this.attrValues.value || {};
		},
	},
	data() {
		return {
			propsData: {
				aggregatorName: "",
				aggregatorNames: [],
				rendererName: "",
				rowOrder: "key_a_to_z",
				colOrder: "key_a_to_z",
				data: [],
				vals: [],
				cols: [],
				rows: [],
				valueFilter: {},
				aggregatorVals: {}, // Store vals per aggregator: { "Sum": ["Amount"], "Average": ["Amount"] }
			},
			openStatus: {},
			attrValues: shallowRef({}),
			unusedOrder: [],
			zIndices: {},
			maxZIndex: 1000,
			openDropdown: false,
			materializedInput: shallowRef([]),
			// Performance optimization: use shallowRef for large pivot results
			pivotResult: shallowRef(null),
			isCalculating: false,
			calculationError: null,
			debounceTimer: null,
			sortIcons: {
				key_a_to_z: {
					rowSymbol: "↕",
					colSymbol: "↔",
					next: "value_a_to_z",
				},
				value_a_to_z: {
					rowSymbol: "↓",
					colSymbol: "→",
					next: "value_z_to_a",
				},
				value_z_to_a: {
					rowSymbol: "↑",
					colSymbol: "←",
					next: "key_a_to_z",
				},
			},
		};
	},
	beforeUpdate() {
		// Vue 3 lifecycle hook - no parameters
		// Data changes are handled by watch
	},
	created() {
		this.materializeInput(this.data);
		this.propsData.vals = this.vals.slice();
		this.propsData.rows = this.rows;
		this.propsData.cols = this.cols;
		// Initialize aggregatorVals if not already set
		if (!this.propsData.aggregatorVals || Object.keys(this.propsData.aggregatorVals).length === 0) {
			this.propsData.aggregatorVals = {};
		}
		const preferredDefaults = [__("Count"), __("Sum")].filter((name) =>
			Object.keys(aggregators).includes(name)
		);
		const initialAggregators =
			Array.isArray(this.aggregatorNames) && this.aggregatorNames.length
				? this.aggregatorNames.slice()
				: Array.isArray(this.aggregatorName)
				? this.aggregatorName.slice()
				: [
						this.propsData.aggregatorName ||
							(this.aggregatorName && typeof this.aggregatorName === "string"
								? this.aggregatorName
								: null) ||
							preferredDefaults[0] ||
							Object.keys(aggregators)[0],
				  ];
		if (!initialAggregators.length && preferredDefaults.length) {
			initialAggregators.push(...preferredDefaults);
		} else if (preferredDefaults.length) {
			preferredDefaults.forEach((name) => {
				if (!initialAggregators.includes(name)) {
					initialAggregators.push(name);
				}
			});
		}
		this.updateAggregatorSelection(initialAggregators);
		this.unusedOrder = this.unusedAttrs;
		Object.keys(this.attrValues.value || {}).map(this.assignValue);
		Object.keys(this.openStatus).map(this.assignValue);
		// Initial pivot calculation - don't debounce on mount
		this.calculatePivot(true);
	},
	beforeUnmount() {
		// Clean up debounce timer
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
	},
	watch: {
		data() {
			this.materializeInput(this.data);
			this.propsData.vals = this.vals.slice();
			this.propsData.rows = this.rows;
			this.propsData.cols = this.cols;
			this.unusedOrder = this.unusedAttrs;
			Object.keys(this.attrValues.value || {}).map(this.assignValue);
			Object.keys(this.openStatus).map(this.assignValue);
		},
		aggregatorName(newValue) {
			if (Array.isArray(newValue)) {
				this.updateAggregatorSelection(newValue);
			} else if (typeof newValue === "string") {
				const preferredDefaults = [__("Count"), __("Sum")].filter((name) =>
					Object.keys(aggregators).includes(name)
				);
				const next = [newValue];
				preferredDefaults.forEach((name) => {
					if (!next.includes(name)) {
						next.push(name);
					}
				});
				this.updateAggregatorSelection(next);
			}
		},
		aggregatorNames(newValue) {
			if (Array.isArray(newValue)) {
				this.updateAggregatorSelection(newValue);
			}
		},
	},
	methods: {
		assignValue(field) {
			if (this.valueFilter) {
				this.propsData.valueFilter = this.valueFilter
			} else {
				this.propsData.valueFilter = {
					...this.propsData.valueFilter,
					[field]: {},
				};
			}
		},
		propUpdater(key) {
			return (value) => {
				this.propsData[key] = value;
			};
		},
		normalizeAggregators(list = []) {
			const available = this.availableAggregators;
			const seen = new Set();
			const normalized = [];

			list.forEach((name) => {
				if (typeof name !== "string") {
					return;
				}
				if (!available.includes(name)) {
					return;
				}
				if (seen.has(name)) {
					return;
				}
				normalized.push(name);
				seen.add(name);
			});

			if (!normalized.length) {
				const fallbackCandidates = [
					this.propsData.aggregatorName,
					Array.isArray(this.aggregatorName) ? this.aggregatorName[0] : this.aggregatorName,
					available[0],
				].filter(Boolean);

				const fallback = fallbackCandidates.find((name) => available.includes(name));
				if (fallback) {
					normalized.push(fallback);
				}
			}

			return normalized;
		},
		ensureValSlots(aggregatorList) {
			// Ensure each aggregator has its required number of value slots
			const allowedAttributes = this.valueAttrOptions;
			const fallbackAttr =
				allowedAttributes[0] ||
				this.propsData.vals[0] ||
				this.vals[0] ||
				null;

			aggregatorList.forEach((name) => {
				if (!aggregators[name]) {
					return;
				}
				const numInputs = aggregators[name]([])().numInputs || 0;
				// Always ensure at least one value slot, even if numInputs is 0 (like Count)
				const minInputs = numInputs > 0 ? numInputs : 1;
				
				// Initialize aggregatorVals for this aggregator if it doesn't exist
				if (!this.propsData.aggregatorVals[name]) {
					this.propsData.aggregatorVals[name] = [];
				}
				
				const currentVals = this.propsData.aggregatorVals[name];
				const nextVals = currentVals.slice(0, minInputs);
				
				// Fill up to required number of inputs (at least 1)
				while (nextVals.length < minInputs) {
					const suggestion =
						allowedAttributes[nextVals.length] || fallbackAttr || null;
					nextVals.push(suggestion);
				}
				
				// Trim if too many (but keep at least 1 if numInputs is 0)
				if (numInputs > 0 && nextVals.length > numInputs) {
					nextVals.splice(numInputs);
				} else if (numInputs === 0 && nextVals.length > 1) {
					nextVals.splice(1);
				}
				
				this.propsData.aggregatorVals[name] = nextVals;
			});

			// Remove vals for aggregators that are no longer selected
			Object.keys(this.propsData.aggregatorVals).forEach((name) => {
				if (!aggregatorList.includes(name)) {
					delete this.propsData.aggregatorVals[name];
				}
			});

			// For backward compatibility, also update the main vals array
			// Use the first aggregator's vals or the maximum required
			const maxRequired = aggregatorList.reduce((largest, name) => {
				if (!aggregators[name]) {
					return largest;
				}
				const numInputs = aggregators[name]([])().numInputs || 0;
				return Math.max(largest, numInputs);
			}, 0);

			if (maxRequired === 0) {
				this.propsData.vals = [];
			} else {
				// Use first aggregator's vals or create default
				const firstAggregator = aggregatorList[0];
				if (firstAggregator && this.propsData.aggregatorVals[firstAggregator]) {
					this.propsData.vals = this.propsData.aggregatorVals[firstAggregator].slice();
				} else {
					const nextVals = this.propsData.vals.slice(0, maxRequired);
					while (nextVals.length < maxRequired) {
						const suggestion =
							allowedAttributes[nextVals.length] || fallbackAttr || null;
						nextVals.push(suggestion);
					}
					this.propsData.vals = nextVals;
				}
			}
		},
		updateAggregatorSelection(list) {
			const normalized = this.normalizeAggregators(list);
			if (!normalized.length) {
				return;
			}

			const current = this.propsData.aggregatorNames || [];
			const isSameLength = current.length === normalized.length;
			const isSameOrder =
				isSameLength && current.every((value, index) => value === normalized[index]);

			if (!isSameOrder) {
				this.propsData.aggregatorNames = normalized;
			}

			this.propsData.aggregatorName = normalized[0];
			this.ensureValSlots(normalized);
			// Trigger pivot recalculation with debouncing
			this.calculatePivot();
		},
		addAggregator() {
			const current = this.selectedAggregators.slice();
			const next = this.availableAggregators.find((name) => !current.includes(name));
			if (!next) {
				return;
			}
			current.push(next);
			this.updateAggregatorSelection(current);
		},
		removeAggregator(index) {
			const current = this.selectedAggregators.slice();
			if (current.length <= 1) {
				return;
			}
			current.splice(index, 1);
			this.updateAggregatorSelection(current);
		},
		changeAggregator(index, value) {
			if (!this.availableAggregators.includes(value)) {
				return;
			}
			const current = this.selectedAggregators.slice();
			if (current[index] === value) {
				return;
			}
			const oldAggregatorName = current[index];
			// Preserve vals when changing aggregator if the new aggregator doesn't have vals yet
			if (oldAggregatorName && this.propsData.aggregatorVals[oldAggregatorName]) {
				const oldVals = this.propsData.aggregatorVals[oldAggregatorName];
				if (!this.propsData.aggregatorVals[value]) {
					// Copy vals from old aggregator if new one doesn't have any
					this.propsData.aggregatorVals[value] = oldVals.slice();
				}
			}
			const duplicateIndex = current.findIndex((item, idx) => item === value && idx !== index);
			if (duplicateIndex !== -1) {
				current.splice(duplicateIndex, 1);
			}
			current[index] = value;
			this.updateAggregatorSelection(current);
		},
		updateValueFilter({ attribute, valueFilter }) {
			this.propsData.valueFilter[attribute] = { ...valueFilter };
			if (typeof cur_list !== 'undefined' && cur_list) {
				cur_list.pivot_value_filter = this.propsData.valueFilter;
			}
			// Trigger pivot recalculation with debouncing
			this.calculatePivot();
		},
		moveFilterBoxToTop({ attribute }) {
			this.maxZIndex += 1;
			this.zIndices[attribute] = this.maxZIndex + 1;
		},
		openFilterBox({ attribute, open }) {
			for (const attr in this.openStatus) {
				this.openStatus[attr] = false;
			}
			this.openStatus[attribute] = open;
		},
		materializeInput(nextData) {
			if (this.propsData.data === nextData) {
				return;
			}
			this.propsData.data = nextData;
			const attrValues = {};
			const materializedInput = [];
			let recordsProcessed = 0;
			PivotData.forEachRecord(
				this.data,
				this.derivedAttributes,
				function (record) {
					materializedInput.push(record);
					for (const attr of Object.keys(record)) {
						if (!(attr in attrValues)) {
							attrValues[attr] = {};
							if (recordsProcessed > 0) {
								attrValues[attr].null = recordsProcessed;
							}
						}
					}
					for (const attr in attrValues) {
						const value = attr in record ? record[attr] : "null";
						if (!(value in attrValues[attr])) {
							attrValues[attr][value] = 0;
						}
						attrValues[attr][value]++;
					}
					recordsProcessed++;
				}
			);
			this.materializedInput.value = materializedInput;
			this.attrValues.value = attrValues;
			
			// Trigger pivot recalculation after materialization
			this.calculatePivot();
		},
		calculatePivot(isInitial = false) {
			// For initial calculation, don't debounce - start immediately
			// For subsequent changes, debounce to avoid excessive worker calls
			if (isInitial) {
				// Clear any existing timer
				if (this.debounceTimer) {
					clearTimeout(this.debounceTimer);
					this.debounceTimer = null;
				}
				// Start calculation immediately and set calculating state
				this.performPivotCalculation();
			} else {
				// Debounce subsequent calculations
				if (this.debounceTimer) {
					clearTimeout(this.debounceTimer);
				}

				// Set calculating state immediately if we're going to use worker
				// This ensures TableRenderer shows "Calculating..." even during debounce
				if (Array.isArray(this.data) && this.data.length >= WORKER_THRESHOLD) {
					const hasFunctionDerivedAttrs = Object.keys(this.derivedAttributes || {}).length > 0 && 
						Object.values(this.derivedAttributes || {}).some(attr => typeof attr === 'function');
					const hasFunctionSorters = Object.keys(this.sorters || {}).length > 0 && 
						Object.values(this.sorters || {}).some(sorter => typeof sorter === 'function');
					
					if (pivotWorkerManager.isAvailable() && !hasFunctionDerivedAttrs && !hasFunctionSorters) {
						this.isCalculating = true;
					}
				}

				this.debounceTimer = setTimeout(async () => {
					await this.performPivotCalculation();
				}, 150); // 150ms debounce
			}
		},
		async performPivotCalculation() {
			if (!Array.isArray(this.data) || this.data.length === 0) {
				if (this.pivotResult) {
					this.pivotResult.value = null;
				}
				return;
			}

			// Check if we have non-serializable objects (functions in derivedAttributes or sorters)
			const hasFunctionDerivedAttrs = Object.keys(this.derivedAttributes || {}).length > 0 && 
				Object.values(this.derivedAttributes || {}).some(attr => typeof attr === 'function');
			const hasFunctionSorters = Object.keys(this.sorters || {}).length > 0 && 
				Object.values(this.sorters || {}).some(sorter => typeof sorter === 'function');

			// Use Web Worker if available, dataset is large, and no function-based derived attributes or sorters
			const shouldUseWorker = pivotWorkerManager.isAvailable() && 
				this.data.length >= WORKER_THRESHOLD && 
				!hasFunctionDerivedAttrs && 
				!hasFunctionSorters;

			if (shouldUseWorker) {
				this.isCalculating = true;
				this.calculationError = null;

				try {
					// Deep serialize all data to ensure Vue reactive proxies are converted to plain objects
					const serializeForWorker = (obj) => {
						try {
							return JSON.parse(JSON.stringify(obj));
						} catch (e) {
							// If serialization fails, return empty/default value
							if (Array.isArray(obj)) return [];
							if (typeof obj === 'object' && obj !== null) return {};
							return obj;
						}
					};

					// Convert Vue reactive proxies to plain objects for serialization
					const dataToSend = this.materializedInput.value.length > 0 
						? serializeForWorker(this.materializedInput.value)
						: serializeForWorker(this.data);

					// Serialize the entire config object
					const config = {
						data: dataToSend,
						rows: serializeForWorker(this.propsData.rows),
						cols: serializeForWorker(this.propsData.cols),
						vals: serializeForWorker(this.propsData.vals),
						aggregatorNames: serializeForWorker(this.propsData.aggregatorNames),
						aggregatorVals: serializeForWorker(this.propsData.aggregatorVals),
						valueFilter: serializeForWorker(this.propsData.valueFilter),
						derivedAttributes: {}, // Empty - functions can't be serialized
						sorters: {}, // Empty - functions can't be serialized
						rowOrder: this.propsData.rowOrder,
						colOrder: this.propsData.colOrder
					};

					const calcStartTime = performance.now();
					const result = await pivotWorkerManager.calculatePivot(config);
					const calcEndTime = performance.now();
					
					console.log(`[Performance] Worker Calculation: ${(calcEndTime - calcStartTime).toFixed(2)}ms for ${this.data.length} records`);
					
					if (this.pivotResult) {
						this.pivotResult.value = result;
					}
				} catch (error) {
					console.error('Worker calculation error, falling back to sync:', error);
					this.calculationError = error;
					// Fallback to synchronous calculation
					this.performPivotCalculationSync();
				} finally {
					this.isCalculating = false;
				}
			} else {
				// For small datasets, don't use pivotResult - TableRenderer will create pivotData directly
				// Clear any existing pivotResult from previous large dataset calculations
				if (this.pivotResult) {
					this.pivotResult.value = null;
				}
				// TableRenderer will handle synchronous calculation in its render function
				// No need to pre-calculate here
			}
		},
		performPivotCalculationSync() {
			try {
				const calcStartTime = performance.now();
				const pivotData = new PivotData({
					data: this.materializedInput.value.length > 0 ? this.materializedInput.value : this.data,
					rows: this.propsData.rows,
					cols: this.propsData.cols,
					vals: this.propsData.vals,
					aggregatorNames: this.propsData.aggregatorNames,
					aggregators: aggregators,
					aggregatorVals: this.propsData.aggregatorVals,
					valueFilter: this.propsData.valueFilter,
					derivedAttributes: this.derivedAttributes,
					sorters: this.sorters,
					rowOrder: this.propsData.rowOrder,
					colOrder: this.propsData.colOrder
				});
				const calcEndTime = performance.now();
				
				console.log(`[Performance] Sync Calculation: ${(calcEndTime - calcStartTime).toFixed(2)}ms for ${this.data.length} records`);

				// Convert to same format as worker result
				const rowKeys = pivotData.getRowKeys();
				const colKeys = pivotData.getColKeys();
				const aggregatorNamesList = pivotData.getAggregatorNames();

				const result = {
					rowKeys,
					colKeys,
					aggregatorNames: aggregatorNamesList,
					tree: {},
					rowTotals: {},
					colTotals: {},
					allTotal: {}
				};

				// Build result structure (same as worker)
				for (const rowKey of rowKeys) {
					const flatRowKey = rowKey.join(String.fromCharCode(0));
					result.tree[flatRowKey] = {};
					for (const colKey of colKeys) {
						const flatColKey = colKey.join(String.fromCharCode(0));
						result.tree[flatRowKey][flatColKey] = {};
						for (const aggName of aggregatorNamesList) {
							const aggregator = pivotData.getAggregator(rowKey, colKey, aggName);
							const value = aggregator && typeof aggregator.value === 'function' ? aggregator.value() : null;
							const formatted = aggregator && typeof aggregator.format === 'function' ? aggregator.format(value) : (value !== null && value !== undefined ? String(value) : '');
							result.tree[flatRowKey][flatColKey][aggName] = { value, formatted };
						}
					}
				}

				for (const rowKey of rowKeys) {
					const flatRowKey = rowKey.join(String.fromCharCode(0));
					result.rowTotals[flatRowKey] = {};
					for (const aggName of aggregatorNamesList) {
						const aggregator = pivotData.getAggregator(rowKey, [], aggName);
						const value = aggregator && typeof aggregator.value === 'function' ? aggregator.value() : null;
						const formatted = aggregator && typeof aggregator.format === 'function' ? aggregator.format(value) : (value !== null && value !== undefined ? String(value) : '');
						result.rowTotals[flatRowKey][aggName] = { value, formatted };
					}
				}

				for (const colKey of colKeys) {
					const flatColKey = colKey.join(String.fromCharCode(0));
					result.colTotals[flatColKey] = {};
					for (const aggName of aggregatorNamesList) {
						const aggregator = pivotData.getAggregator([], colKey, aggName);
						const value = aggregator && typeof aggregator.value === 'function' ? aggregator.value() : null;
						const formatted = aggregator && typeof aggregator.format === 'function' ? aggregator.format(value) : (value !== null && value !== undefined ? String(value) : '');
						result.colTotals[flatColKey][aggName] = { value, formatted };
					}
				}

				result.allTotal = {};
				for (const aggName of aggregatorNamesList) {
					const aggregator = pivotData.getAggregator([], [], aggName);
					const value = aggregator && typeof aggregator.value === 'function' ? aggregator.value() : null;
					const formatted = aggregator && typeof aggregator.format === 'function' ? aggregator.format(value) : (value !== null && value !== undefined ? String(value) : '');
					result.allTotal[aggName] = { value, formatted };
				}

				this.pivotResult.value = result;
			} catch (error) {
				console.error('Synchronous pivot calculation error:', error);
				this.calculationError = error;
				if (this.pivotResult) {
					this.pivotResult.value = null;
				}
			}
		},
		makeDnDCell(items, onChange, classes) {
			return h(
				draggable,
				{
					list: items,
					group: "sharted",
					ghostClass: ".pvtPlaceholder",
					filter: ".pvtFilterBox",
					preventOnFilter: false,
					tag: "td",
					class: classes,
					onSort: onChange.bind(this),
					itemKey: (x) => x,
				},
				{
					item: ({ element }) =>
						h(DraggableAttribute, {
							sortable:
								this.sortonlyFromDragDrop.includes(element) ||
								!this.disabledFromDragDrop.includes(element),
							draggable:
								!this.sortonlyFromDragDrop.includes(element) &&
								!this.disabledFromDragDrop.includes(element),
							name: element,
							key: element,
							attrValues: (this.attrValues.value || {})[element] || {},
							sorter: getSort(this.sorters, element),
							menuLimit: this.menuLimit,
							zIndex: this.zIndices[element] || this.maxZIndex,
							valueFilter: this.propsData.valueFilter[element],
							open: this.openStatus[element],
							"onUpdate:filter": this.updateValueFilter,
							"onMoveToTop:filterbox": this.moveFilterBoxToTop,
							"onOpen:filterbox": this.openFilterBox,
						}),
				}
			);
		},
		rendererCell(rendererName) {
			return this.$slots.rendererCell
				? h(
						"td",
						{
							class: ["pvtRenderers pvtVals pvtText"],
						},
						this.$slots.rendererCell
					)
				: h(
						"td",
						{
							class: ["pvtRenderers"],
						},
						[
							h(Dropdown, {
								values: Object.keys(this.renderers),
								value: rendererName,
								title: __('Select how the data should be displayed'),
								onInput: (value) => {
									this.propUpdater("rendererName")(value);
								},
							}),
						]
					);
		},
		aggregatorCell(aggregatorName, vals) {
			return this.$slots.aggregatorCell
				? h(
						"td",
						{
							class: ["pvtVals pvtText"],
						},
						this.$slots.aggregatorCell
					)
				: h(
						"td",
						{
							class: ["pvtVals"],
						},
						[
							h(
								"div",
								{ class: ["pvtAggregatorList"] },
								this.selectedAggregators.map((name, index) => {
									const aggregator = aggregators[name];
									const numInputs = aggregator ? (aggregator([])().numInputs || 0) : 0;
									const aggregatorVals = this.propsData.aggregatorVals[name] || [];
									
									return h(
										"div",
										{
											class: ["pvtAggregatorOption"],
											key: `aggregator-${name}-${index}`,
										},
										[
											h(Dropdown, {
												style: {
													display: "inline-block",
													minWidth: "120px",
												},
												values: this.availableAggregators,
												value: name,
												title: __('Select the aggregation method for the data'),
												onInput: (value) => {
													this.changeAggregator(index, value);
												},
											}),
											// Value dropdown(s) for this aggregator
											// Always show at least one value dropdown, even if numInputs is 0 (like Count)
											h(
												"span",
												{
													style: {
														display: "inline-flex",
														alignItems: "center",
														gap: "6px",
														marginLeft: "12px",
														paddingLeft: "12px",
														borderLeft: "1px solid #e2e8f0",
													},
												},
												[
													// Show "Values:" label only if numInputs > 1, otherwise "Value:"
													(numInputs > 1 ? numInputs : 1) > 1
														? h("span", {
																style: {
																	fontSize: "12px",
																	color: "#64748b",
																	fontWeight: "500",
																	marginRight: "4px",
																},
															}, "Values:")
														: h("span", {
																style: {
																	fontSize: "12px",
																	color: "#64748b",
																	fontWeight: "500",
																	marginRight: "4px",
																},
															}, "Value:"),
													// Always show at least one dropdown, use numInputs if > 0, otherwise 1
													...new Array(numInputs > 0 ? numInputs : 1).fill().map((n, i) =>
														h(Dropdown, {
															style: {
																display: "inline-block",
																minWidth: "110px",
																marginRight: i < (numInputs > 0 ? numInputs : 1) - 1 ? "8px" : "0",
																fontSize: "13px",
															},
															values: Object.keys(this.attrValues.value || {}).filter(
																(e) =>
																	!this.hiddenAttributes.includes(e) &&
																	!this.hiddenFromAggregators.includes(e)
															),
															value: aggregatorVals[i] || null,
															title: __('Select the value field for this aggregation'),
															onInput: (value) => {
																if (!this.propsData.aggregatorVals[name]) {
																	this.propsData.aggregatorVals[name] = [];
																}
																// Ensure array is long enough
																while (this.propsData.aggregatorVals[name].length <= i) {
																	this.propsData.aggregatorVals[name].push(null);
																}
																this.propsData.aggregatorVals[name][i] = value;
																// Trigger reactivity by updating the object reference
																this.propsData.aggregatorVals = { ...this.propsData.aggregatorVals };
															},
														})
													),
												]
											),
											this.selectedAggregators.length > 1
												? h(
														"a",
														{
															class: ["pvtAggregatorRemove"],
															role: "button",
															title: __('Remove aggregation'),
															onClick: (event) => {
																event?.preventDefault?.();
																this.removeAggregator(index);
															},
														},
														"×"
												  )
												: null,
										]
									);
								})
							),
							this.selectedAggregators.length < this.availableAggregators.length
								? h(
										"a",
										{
											class: ["pvtAggregatorAdd"],
											role: "button",
											title: __('Add another aggregation'),
											onClick: (event) => {
												event?.preventDefault?.();
												this.addAggregator();
											},
										},
										"+"
								  )
								: null,
							h(
								"div",
								{ class: ["pvtAggregatorOrders"] },
								[
									h(
										"a",
										{
											class: ["pvtRowOrder"],
											title: __('Update the order of the rows'),
											role: "button",
											onClick: (event) => {
												event?.preventDefault?.();
												this.propUpdater("rowOrder")(
													this.sortIcons[this.propsData.rowOrder].next
												);
											},
										},
										this.sortIcons[this.propsData.rowOrder].rowSymbol
									),
									h(
										"a",
										{
											class: ["pvtColOrder"],
											title: __('Update the order of the columns'),
											role: "button",
											onClick: (event) => {
												event?.preventDefault?.();
												this.propUpdater("colOrder")(
													this.sortIcons[this.propsData.colOrder].next
												);
											},
										},
										this.sortIcons[this.propsData.colOrder].colSymbol
									),
								]
							),
							// Old shared value dropdowns removed - each aggregator now has its own value dropdowns
						]
					);
		},
		outputCell(props) {
			return h(
				"td",
				{
					class: ["pvtOutput"],
				},
				[h(Pivottable, props)]
			);
		},
	},
	render() {
		if (this.data.length < 1) return;
		console.log(this.propsData, 'this props data ++++++++++');
		const rendererName = this.propsData.rendererName || this.rendererName;
		const aggregatorName =
			this.selectedAggregators[0] ||
			(this.propsData.aggregatorName && typeof this.propsData.aggregatorName === "string"
				? this.propsData.aggregatorName
				: null) ||
			(Array.isArray(this.aggregatorName) ? this.aggregatorName[0] : this.aggregatorName);
		const aggregatorNames = this.selectedAggregators;
		const vals = this.propsData.vals;
		const unusedAttrsCell = this.makeDnDCell(
			this.unusedAttrs,
			(e) => {
				const item = e.item.getAttribute("data-id");
				if (
					this.sortonlyFromDragDrop.includes(item) &&
					(!e.from.classList.contains("pvtUnused") ||
						!e.to.classList.contains("pvtUnused"))
				) {
					return;
				}
				if (e.from.classList.contains("pvtUnused")) {
					this.unusedOrder.splice(e.oldIndex, 1);
				}
				if (e.to.classList.contains("pvtUnused")) {
					this.unusedOrder.splice(e.newIndex, 0, item);
				}
			},
			`pvtAxisContainer pvtUnused pvtHorizList`,
			h
		);
		const colAttrsCell = this.makeDnDCell(
			this.colAttrs,
			(e) => {
				const item = e.item.getAttribute("data-id");
				if (
					this.sortonlyFromDragDrop.includes(item) &&
					(!e.from.classList.contains("pvtCols") ||
						!e.to.classList.contains("pvtCols"))
				) {
					return;
				}
				if (e.from.classList.contains("pvtCols")) {
					this.propsData.cols.splice(e.oldIndex, 1);
				}
				if (e.to.classList.contains("pvtCols")) {
					this.propsData.cols.splice(e.newIndex, 0, item);
				}
			},
			"pvtAxisContainer pvtHorizList pvtCols",
			h
		);
		const rowAttrsCell = this.makeDnDCell(
			this.rowAttrs,
			(e) => {
				const item = e.item.getAttribute("data-id");
				if (
					this.sortonlyFromDragDrop.includes(item) &&
					(!e.from.classList.contains("pvtRows") ||
						!e.to.classList.contains("pvtRows"))
				) {
					return;
				}
				if (e.from.classList.contains("pvtRows")) {
					this.propsData.rows.splice(e.oldIndex, 1);
				}
				if (e.to.classList.contains("pvtRows")) {
					this.propsData.rows.splice(e.newIndex, 0, item);
				}
			},
			"pvtAxisContainer pvtVertList pvtRows",
			h
		);
		const props = {
			...this.$props,
			data: this.materializedInput.value,
			rowOrder: this.propsData.rowOrder,
			colOrder: this.propsData.colOrder,
			valueFilter: this.propsData.valueFilter,
			rows: this.propsData.rows,
			cols: this.propsData.cols,
			rendererName,
			aggregatorName,
			aggregatorNames,
			vals,
			aggregatorVals: this.propsData.aggregatorVals, // Pass per-aggregator vals
			// Pass pre-calculated pivot result from worker (only when worker was used)
			pivotResult: this.pivotResult ? this.pivotResult.value : null,
			// usePreCalculatedResult should be true when we actually INTEND to use worker
			// (same conditions as performPivotCalculation uses to decide)
			usePreCalculatedResult: (() => {
				if (!Array.isArray(this.data) || this.data.length < WORKER_THRESHOLD) {
					return false;
				}
				// Check if we have non-serializable objects (functions in derivedAttributes or sorters)
				const hasFunctionDerivedAttrs = Object.keys(this.derivedAttributes || {}).length > 0 && 
					Object.values(this.derivedAttributes || {}).some(attr => typeof attr === 'function');
				const hasFunctionSorters = Object.keys(this.sorters || {}).length > 0 && 
					Object.values(this.sorters || {}).some(sorter => typeof sorter === 'function');
				
				// Use same logic as performPivotCalculation to determine if we should use worker
				return pivotWorkerManager.isAvailable() && 
					!hasFunctionDerivedAttrs && 
					!hasFunctionSorters;
			})(),
			isCalculating: this.isCalculating,
			calculationError: this.calculationError,
		};

		const rendererCell = this.rendererCell(rendererName);
		const aggregatorCell = this.aggregatorCell(aggregatorName, vals);
		const outputCell = this.outputCell(props);

		return h(
			"table",
			{
				class: ["pvtUi"],
			},
			[
				h("tbody", [
					h("tr", [rendererCell, unusedAttrsCell]),
					h("tr", [aggregatorCell, colAttrsCell]),
					h("tr", [rowAttrsCell, outputCell]),
				]),
			]
		);
	},
};
