import common from "../utils/defaultProps.js";
import DraggableAttribute from "./DraggableAttribute.js";
import Dropdown from "./Dropdown.js";
import Pivottable from "./Pivottable.js";
import { PivotEngine, forEachRecord } from "../utils/pivotEngine.js";
import { getSort, aggregators, sortAs } from "../utils/utils.js";
import draggable from "vuedraggable";
import TableRenderer from "./TableRenderer.js";
import { h, shallowRef, computed, watch, nextTick, onUnmounted } from "vue";
import { pivotWorkerManager } from "../utils/pivotWorkerManager.js";
import "../styles/pivottable.css";

// Threshold for using Web Worker (records count)
const WORKER_THRESHOLD = 10000;

// LRU Cache implementation
class LRUCache {
	constructor(maxSize = 5) {
		this.maxSize = maxSize;
		this.cache = new Map(); // Map maintains insertion order in modern JS
	}

	get(key) {
		if (!this.cache.has(key)) {
			return null;
		}
		// Move to end (most recently used)
		const value = this.cache.get(key);
		this.cache.delete(key);
		this.cache.set(key, value);
		return value;
	}

	set(key, value) {
		if (this.cache.has(key)) {
			// Update existing: move to end
			this.cache.delete(key);
		} else if (this.cache.size >= this.maxSize) {
			// Remove least recently used (first item)
			const firstKey = this.cache.keys().next().value;
			this.cache.delete(firstKey);
		}
		// Add to end (most recently used)
		this.cache.set(key, value);
	}

	has(key) {
		return this.cache.has(key);
	}

	clear() {
		this.cache.clear();
	}

	get size() {
		return this.cache.size;
	}
}

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
		headerFields: {
			type: Array,
			default: function () {
				return [];
			},
		},
		validateColumnDrop: {
			type: Function,
			default: null,
		},
		enableVirtualization: {
			type: Boolean,
			default: false,
		},
		virtualizationThreshold: {
			type: Number,
			default: 100,
		},
		virtualizationMaxHeight: {
			type: Number,
			default: 600,
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
			notification: {
				show: false,
				message: "",
				type: "info", // 'info', 'warning', 'error'
			},
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
			showControlPanel: true,
		materializedInput: shallowRef([]),
			// Performance optimization: use shallowRef for large pivot results
			pivotResult: shallowRef(null),
			isCalculating: false,
			calculationError: null,
			debounceTimer: null,
			// LRU Cache for materialized input and attrValues (max 5 entries)
			materializedDataCache: new LRUCache(5),
			// LRU Cache for worker calculation results (max 5 entries)
			workerResultCache: new LRUCache(5),
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
		// Ensure pivotResult is always initialized as a valid shallowRef
		// This prevents "Cannot set properties of null" errors
		// Check if pivotResult exists and is a valid object with 'value' property
		if (!this.pivotResult || typeof this.pivotResult !== 'object' || !('value' in this.pivotResult)) {
			this.pivotResult = shallowRef(null);
		}
		
		this.materializeInput(this.data);
		this.propsData.vals = this.vals.slice();
		this.propsData.rows = [...this.rows];
		this.propsData.cols = [...this.cols];
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
			// Clear caches when data changes (new dataset means old caches are invalid)
			this.materializedDataCache.clear();
			this.workerResultCache.clear();
			
			this.materializeInput(this.data);
			this.propsData.vals = this.vals.slice();
			this.propsData.rows = [...this.rows];
			this.propsData.cols = [...this.cols];
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
		toggleControlPanel() {
			this.showControlPanel = !this.showControlPanel;
		},
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
				// Clear worker cache when rowOrder or colOrder changes
				if (key === 'rowOrder' || key === 'colOrder') {
					this.clearWorkerCache();
				}
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
				// Check numInputs properly for aggregators that require multiple inputs
				let numInputs = 0;
				try {
					// Check with 2 undefined values (for "Sum over Sum" type aggregators)
					const testWith2 = aggregators[name]([undefined, undefined])().numInputs;
					if (testWith2 === 2) {
						numInputs = 2;
					} else {
						// Check with 1 undefined value (for single-input aggregators)
						const testWith1 = aggregators[name]([undefined])().numInputs;
						if (testWith1 === 1) {
							numInputs = 1;
						} else {
							// Check with empty array (for no-input aggregators like Count)
							const testWith0 = aggregators[name]([])().numInputs || 0;
							numInputs = testWith0;
						}
					}
				} catch (e) {
					// Fallback: try with empty array
					numInputs = aggregators[name]([])().numInputs || 0;
				}
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
				this.clearWorkerCache();
			} else {
				// Use first aggregator's vals or create default
				const firstAggregator = aggregatorList[0];
				if (firstAggregator && this.propsData.aggregatorVals[firstAggregator]) {
					this.propsData.vals = this.propsData.aggregatorVals[firstAggregator].slice();
					this.clearWorkerCache();
				} else {
					const nextVals = this.propsData.vals.slice(0, maxRequired);
					while (nextVals.length < maxRequired) {
						const suggestion =
							allowedAttributes[nextVals.length] || fallbackAttr || null;
						nextVals.push(suggestion);
					}
					this.propsData.vals = nextVals;
					this.clearWorkerCache();
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
				// Clear worker cache when aggregators change
				this.clearWorkerCache();
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
			// Clear worker cache when filters change
			this.cachedWorkerResult = null;
			this.cachedWorkerResultHash = null;
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
		// Generate a simple hash for cache key (fast hash function)
		generateDataHash(data) {
			if (!data || !Array.isArray(data)) {
				return 'empty';
			}
			// Use data length and first/last record as quick identity check
			// For more accuracy, could use a proper hash function, but this is faster
			const dataLength = data.length;
			const firstRecord = dataLength > 0 ? JSON.stringify(data[0]) : '';
			const lastRecord = dataLength > 0 ? JSON.stringify(data[dataLength - 1]) : '';
			// Include reference identity for same data object
			return `${dataLength}_${firstRecord.substring(0, 50)}_${lastRecord.substring(0, 50)}_${data === this.data ? 'same' : 'diff'}`;
		},
		// Generate hash for worker configuration
		generateWorkerConfigHash(config) {
			// Create a hash from all configuration parameters
			try {
				return JSON.stringify({
					dataLength: config.data?.length || 0,
					rows: config.rows,
					cols: config.cols,
					vals: config.vals,
					aggregatorNames: config.aggregatorNames,
					aggregatorVals: config.aggregatorVals,
					valueFilter: config.valueFilter,
					rowOrder: config.rowOrder,
					colOrder: config.colOrder
				});
			} catch (e) {
				// Fallback to simple string if JSON.stringify fails
				return `${config.data?.length || 0}_${config.rows?.join(',')}_${config.cols?.join(',')}_${config.aggregatorNames?.join(',')}`;
			}
		},
		// Clear worker result cache when configuration changes
		clearWorkerCache() {
			this.workerResultCache.clear();
		},
		materializeInput(nextData) {
			if (this.propsData.data === nextData) {
				return;
			}
			this.propsData.data = nextData;
			
			// Check LRU cache for materialized input
			const dataHash = this.generateDataHash(this.data);
			const cachedData = this.materializedDataCache.get(dataHash);
			if (cachedData) {
				// Use cached materialized data
				this.materializedInput.value = cachedData.materializedInput;
				this.attrValues.value = cachedData.attrValues;
				console.log(`[Cache] Using cached materialized input (${this.data.length} records, cache size: ${this.materializedDataCache.size})`);
				// Trigger pivot recalculation after materialization
				this.calculatePivot();
				return;
			}
			
			// Materialize input (expensive operation)
			const materializeStartTime = performance.now();
			const attrValues = {};
			const materializedInput = [];
			let recordsProcessed = 0;
			forEachRecord(
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
						// Normalize null/undefined to "null" string for consistency with calculation engine
						const rawValue = attr in record ? record[attr] : undefined;
						const value = rawValue === null || rawValue === undefined ? "null" : rawValue;
						if (!(value in attrValues[attr])) {
							attrValues[attr][value] = 0;
						}
						attrValues[attr][value]++;
					}
					recordsProcessed++;
				}
			);
			const materializeEndTime = performance.now();
			
			// Update values
			this.materializedInput.value = materializedInput;
			this.attrValues.value = attrValues;
			
			// Cache the materialized data in LRU cache
			this.materializedDataCache.set(dataHash, {
				materializedInput: [...materializedInput], // Create a copy
				attrValues: JSON.parse(JSON.stringify(attrValues)) // Deep copy
			});
			
			console.log(`[Performance] Materialization: ${(materializeEndTime - materializeStartTime).toFixed(2)}ms for ${this.data.length} records`);
			
			// Trigger pivot recalculation after materialization
			this.calculatePivot();
		},
		calculatePivot(isInitial = false) {
			// Always set calculating state immediately to show loading indicator
			// This ensures smooth UI even for small datasets
			this.isCalculating = true;
			
			// For initial calculation, don't debounce - start immediately
			// For subsequent changes, debounce to avoid excessive worker calls
			if (isInitial) {
				// Clear any existing timer
				if (this.debounceTimer) {
					clearTimeout(this.debounceTimer);
					this.debounceTimer = null;
				}
				// Use nextTick to allow UI to update before starting calculation
				nextTick(() => {
					this.performPivotCalculation();
				});
			} else {
				// Debounce subsequent calculations
				if (this.debounceTimer) {
					clearTimeout(this.debounceTimer);
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

					// Check LRU cache for worker result
					const configHash = this.generateWorkerConfigHash(config);
					const cachedResult = this.workerResultCache.get(configHash);
					if (cachedResult) {
						// Use cached worker result
						console.log(`[Cache] Using cached worker result (${this.data.length} records, cache size: ${this.workerResultCache.size})`);
						
					// CRITICAL: Ensure pivotResult is initialized before setting value
					// Check existence first to avoid "Cannot read property 'value' of null" errors
					if (!this.pivotResult || typeof this.pivotResult !== 'object' || !('value' in this.pivotResult)) {
						this.pivotResult = shallowRef(null);
					}
					this.pivotResult.value = cachedResult;
						this.isCalculating = false;
						return;
					}

					const calcStartTime = performance.now();
					const result = await pivotWorkerManager.calculatePivot(config);
					const calcEndTime = performance.now();
					
					console.log(`[Performance] Worker Calculation: ${(calcEndTime - calcStartTime).toFixed(2)}ms for ${this.data.length} records`);
					
					// Apply Top-N filtering after pivot calculation
					const topNThreshold = 50; // Default threshold
					const enableTopN = true; // Always enable Top-N
					
					if (enableTopN && result.rowKeys && result.rowKeys.length > topNThreshold) {
						// Calculate aggregated values for each row to determine top N
						const rowValues = result.rowKeys.map((rowKey, index) => {
							const flatRowKey = rowKey.join(String.fromCharCode(0));
							let aggregatedValue = 0;
							let count = 0;
							
							// Sum values across all columns and aggregators for this row
							for (const colKey of result.colKeys) {
								const flatColKey = colKey.join(String.fromCharCode(0));
								if (result.tree[flatRowKey] && result.tree[flatRowKey][flatColKey]) {
									for (const aggName of result.aggregatorNames) {
										const cellData = result.tree[flatRowKey][flatColKey][aggName];
										if (cellData && cellData.value !== null && cellData.value !== undefined) {
											aggregatedValue += typeof cellData.value === 'number' 
												? cellData.value 
												: (parseFloat(cellData.value) || 0);
											count++;
										}
									}
								}
							}
							
							return {
								rowKey,
								value: aggregatedValue,
								index
							};
						});
						
						// Sort by value descending and take top N
						rowValues.sort((a, b) => b.value - a.value);
						const topNRowIndices = new Set(rowValues.slice(0, topNThreshold).map(item => item.index));
						
						// Filter rowKeys and rebuild tree
						result.rowKeys = result.rowKeys.filter((_, index) => topNRowIndices.has(index));
						
						// Rebuild tree with only top N rows
						const newTree = {};
						for (const rowKey of result.rowKeys) {
							const flatRowKey = rowKey.join(String.fromCharCode(0));
							newTree[flatRowKey] = result.tree[flatRowKey] || {};
						}
						result.tree = newTree;
						
						// Rebuild rowTotals
						const newRowTotals = {};
						for (const rowKey of result.rowKeys) {
							const flatRowKey = rowKey.join(String.fromCharCode(0));
							if (result.rowTotals[flatRowKey]) {
								newRowTotals[flatRowKey] = result.rowTotals[flatRowKey];
							}
						}
						result.rowTotals = newRowTotals;
					}
					
					// Apply Top-N to columns if needed
					if (enableTopN && result.colKeys && result.colKeys.length > topNThreshold) {
						// Calculate aggregated values for each column
						const colValues = result.colKeys.map((colKey, index) => {
							const flatColKey = colKey.join(String.fromCharCode(0));
							let aggregatedValue = 0;
							let count = 0;
							
							// Sum values across all rows and aggregators for this column
							for (const rowKey of result.rowKeys) {
								const flatRowKey = rowKey.join(String.fromCharCode(0));
								if (result.tree[flatRowKey] && result.tree[flatRowKey][flatColKey]) {
									for (const aggName of result.aggregatorNames) {
										const cellData = result.tree[flatRowKey][flatColKey][aggName];
										if (cellData && cellData.value !== null && cellData.value !== undefined) {
											aggregatedValue += typeof cellData.value === 'number' 
												? cellData.value 
												: (parseFloat(cellData.value) || 0);
											count++;
										}
									}
								}
							}
							
							return {
								colKey,
								value: aggregatedValue,
								index
							};
						});
						
						// Sort by value descending and take top N
						colValues.sort((a, b) => b.value - a.value);
						const topNColIndices = new Set(colValues.slice(0, topNThreshold).map(item => item.index));
						
						// Filter colKeys
						result.colKeys = result.colKeys.filter((_, index) => topNColIndices.has(index));
						
						// Rebuild tree with only top N columns
						const newTree = {};
						for (const rowKey of result.rowKeys) {
							const flatRowKey = rowKey.join(String.fromCharCode(0));
							newTree[flatRowKey] = {};
							for (const colKey of result.colKeys) {
								const flatColKey = colKey.join(String.fromCharCode(0));
								if (result.tree[flatRowKey] && result.tree[flatRowKey][flatColKey]) {
									newTree[flatRowKey][flatColKey] = result.tree[flatRowKey][flatColKey];
								}
							}
						}
						result.tree = newTree;
						
						// Rebuild colTotals
						const newColTotals = {};
						for (const colKey of result.colKeys) {
							const flatColKey = colKey.join(String.fromCharCode(0));
							if (result.colTotals[flatColKey]) {
								newColTotals[flatColKey] = result.colTotals[flatColKey];
							}
						}
						result.colTotals = newColTotals;
					}
					
					// Cache the worker result in LRU cache
					this.workerResultCache.set(configHash, JSON.parse(JSON.stringify(result))); // Deep copy
					
					// CRITICAL: Ensure pivotResult is initialized before setting value
					// Check existence first to avoid "Cannot read property 'value' of null" errors
					if (!this.pivotResult || typeof this.pivotResult !== 'object' || !('value' in this.pivotResult)) {
						this.pivotResult = shallowRef(null);
					}
					this.pivotResult.value = result;
				} catch (error) {
					console.error('Worker calculation error, falling back to sync:', error);
					this.calculationError = error;
					// Fallback to synchronous calculation
					this.performPivotCalculationSync();
				} finally {
					this.isCalculating = false;
				}
			} else {
				// For small datasets, still calculate asynchronously to prevent UI freezing
				// This ensures TableRenderer shows loading state and doesn't block UI
				// Calculate and set pivotResult so TableRenderer can use it instead of recalculating
				setTimeout(async () => {
					await this.performPivotCalculationSync();
					// isCalculating is already set to false in performPivotCalculationSync's finally block
				}, 0);
				// Don't return here - let isCalculating flag prevent TableRenderer from rendering synchronously
			}
		},
		async performPivotCalculationSync() {
			// CRITICAL: Ensure pivotResult is always a valid shallowRef object
			// Store in local variable immediately to avoid reactivity issues
			// This must be done synchronously before any async operations
			if (!this.pivotResult || typeof this.pivotResult !== 'object' || !('value' in this.pivotResult)) {
				this.pivotResult = shallowRef(null);
			}
			// Store reference in local variable to avoid multiple property accesses
			// Use let instead of const so we can reassign if needed
			let pivotResultRef = this.pivotResult;
			
			try {
				// Use setTimeout to yield control to browser, allowing UI to update
				// This prevents UI freezing during calculation
				await new Promise(resolve => setTimeout(resolve, 0));
				
				const calcStartTime = performance.now();
				const pivotData = new PivotEngine({
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
						if (aggregator && typeof aggregator.value === 'function') {
							const value = aggregator.value();
							const formatted = aggregator && typeof aggregator.format === 'function' ? aggregator.format(value) : (value !== null && value !== undefined ? String(value) : '');
							result.rowTotals[flatRowKey][aggName] = { value, formatted };
							// Debug: log for List Unique Values and Average to verify stored value
							const cleanAggName = aggName.split('(')[0].trim().toLowerCase();
							if (cleanAggName.includes('list') && cleanAggName.includes('unique')) {
								console.log(`[Row Total Storage] Row key:`, rowKey, `flatRowKey:`, flatRowKey, `Aggregator:`, aggName);
								console.log(`[Row Total Storage] Value:`, value, `Type:`, typeof value);
								console.log(`[Row Total Storage] Formatted:`, formatted, `Type:`, typeof formatted);
								if (aggregator.uniq) {
									console.log(`[Row Total Storage] Aggregator.uniq:`, aggregator.uniq, `Length:`, aggregator.uniq.length);
								}
							}
							if (cleanAggName === 'average' || cleanAggName.includes('average')) {
								console.log(`[Row Total Storage - Average] Row key:`, rowKey, `flatRowKey:`, flatRowKey, `Aggregator:`, aggName);
								console.log(`[Row Total Storage - Average] Value:`, value, `Type:`, typeof value);
								console.log(`[Row Total Storage - Average] Formatted:`, formatted, `Type:`, typeof formatted);
								if (aggregator.n !== undefined) {
									console.log(`[Row Total Storage - Average] Aggregator.n (count):`, aggregator.n);
								}
								if (aggregator.m !== undefined) {
									console.log(`[Row Total Storage - Average] Aggregator.m (mean):`, aggregator.m);
								}
							}
						} else {
							result.rowTotals[flatRowKey][aggName] = { value: null, formatted: '' };
						}
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

			// CRITICAL: Re-check pivotResult after async operations
			// Use the local reference stored at the start of the function
			// If pivotResultRef is still valid, use it; otherwise re-initialize
			if (!pivotResultRef || typeof pivotResultRef !== 'object' || !('value' in pivotResultRef)) {
				// Re-initialize if the local reference is invalid
				pivotResultRef = shallowRef(null);
				this.pivotResult = pivotResultRef;
			}
			
			// Use the local reference to set the value - this avoids accessing this.pivotResult
			// which might have been reset by Vue's reactivity system
			pivotResultRef.value = result;
		} catch (error) {
			console.error('Synchronous pivot calculation error:', error);
			this.calculationError = error;
			// Use the local reference if available, otherwise check this.pivotResult
			if (pivotResultRef && typeof pivotResultRef === 'object' && 'value' in pivotResultRef) {
				pivotResultRef.value = null;
			} else if (this.pivotResult && typeof this.pivotResult === 'object' && 'value' in this.pivotResult) {
				this.pivotResult.value = null;
			}
		} finally {
			// Ensure calculating state is cleared
			this.isCalculating = false;
		}
		},
		showNotification(message, type = "info") {
			// Clear existing timer
			if (this.notificationTimer) {
				clearTimeout(this.notificationTimer);
			}
			
			// Show notification
			this.notification = {
				show: true,
				message: message,
				type: type,
			};
			
			// Auto-hide after 4 seconds
			this.notificationTimer = setTimeout(() => {
				this.notification.show = false;
				this.notificationTimer = null;
			}, 4000);
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
					onMove: (evt) => {
						// onMove is called BEFORE the move happens
						// We can validate here and return false to prevent the move
						// CRITICAL: Check if evt and draggedContext exist before accessing properties
						if (!evt || !evt.draggedContext || !evt.to || !evt.from) {
							// Invalid event - allow the move to proceed normally
							return true;
						}
						
						if (evt.to.classList.contains("pvtCols") && this.validateColumnDrop) {
							// Ensure draggedContext has the required properties
							if (!evt.draggedContext.element || typeof evt.draggedContext.futureIndex === 'undefined') {
								// Invalid draggedContext - allow the move
								return true;
							}
							
							const item = evt.draggedContext.element;
							const currentCols = [...this.cols];
							// Calculate the new index
							let newIndex = evt.draggedContext.futureIndex;
							if (evt.from.classList.contains("pvtCols")) {
								// Moving within pvtCols - adjust index
								const oldIndex = evt.draggedContext.index;
								if (typeof oldIndex !== 'undefined' && oldIndex < newIndex) {
									newIndex = newIndex - 1;
								}
							}
							const validation = this.validateColumnDrop(item, currentCols, newIndex);
							if (!validation.allowed) {
								// Return false to prevent the move completely
								// This should prevent vuedraggable from updating the list
								// Also prevent default and stop propagation to be extra safe
								if (evt.originalEvent) {
									evt.originalEvent.preventDefault();
									evt.originalEvent.stopPropagation();
								}
								return false;
							}
						}
						return true; // Allow the move
					},
					itemKey: (x) => x,
				},
				{
					item: ({ element }) => {
						const isDisabledFromDragDrop = this.disabledFromDragDrop.includes(element);
						const isSortonly = this.sortonlyFromDragDrop.includes(element);
						
						// Determine if field is a header field (can be dragged) or aggregation field (cannot be dragged)
						const isHeaderField = this.headerFields.length === 0 || this.headerFields.includes(element);
						
						// All fields should be sortable to allow filter panels to work
						// Only header fields should be draggable
						const sortable = true; // Always true - filters need this
						const draggable = isHeaderField && !isSortonly && !isDisabledFromDragDrop; // Only header fields can be dragged
						
						return h(DraggableAttribute, {
							sortable: sortable,
							draggable: draggable,
							headerField: isHeaderField,
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
						});
					},
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
									// For aggregators that require multiple inputs (like "Sum over Sum"),
									// we need to check numInputs by passing undefined values
									// Try with 2 undefined values first (for aggregators like "Sum over Sum")
									let numInputs = 0;
									if (aggregator) {
										try {
											// Check with 2 undefined values (for "Sum over Sum" type aggregators)
											const testWith2 = aggregator([undefined, undefined])().numInputs;
											if (testWith2 === 2) {
												numInputs = 2;
											} else {
												// Check with 1 undefined value (for single-input aggregators)
												const testWith1 = aggregator([undefined])().numInputs;
												if (testWith1 === 1) {
													numInputs = 1;
												} else {
													// Check with empty array (for no-input aggregators like Count)
													const testWith0 = aggregator([])().numInputs || 0;
													numInputs = testWith0;
												}
											}
										} catch (e) {
											// Fallback: try with empty array
											numInputs = aggregator([])().numInputs || 0;
										}
									}
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
													minWidth: "40px",
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
														display: numInputs > 1 ? "flex" : "inline-flex",
														flexDirection: numInputs > 1 ? "column" : "row",
														alignItems: numInputs > 1 ? "center" : "center",
														justifyContent: "center",
														gap: "1px",
														marginLeft: "1px",
														paddingLeft: "1px",
														borderLeft: "1px solid #e2e8f0",
														width: numInputs > 1 ? "100%" : "auto",
														maxWidth: numInputs > 1 ? "100%" : "none",
													},
												},
												[
													// Show "Values:" label only if numInputs > 1, otherwise "Value:"
													(numInputs > 1 ? numInputs : 1) > 1
														? h("span", {
																style: {
																	fontSize: "10px",
																	color: "#64748b",
																	fontWeight: "500",
																	marginBottom: "2px",
																	width: "100%",
																},
															}, "Values:")
														: h("span", {
																style: {
																	fontSize: "10px",
																	color: "#64748b",
																	fontWeight: "500",
																	marginRight: "1px",
																},
															}, "Value:"),
													// Always show at least one dropdown, use numInputs if > 0, otherwise 1
													...new Array(numInputs > 0 ? numInputs : 1).fill().map((n, i) => {
														// For "Sum over Sum", label the first dropdown as "Numerator" and second as "Denominator"
														const isSumOverSum = name === __("Sum over Sum");
														const fieldLabel = isSumOverSum 
															? (i === 0 ? "Numerator:" : "Denominator:")
															: (numInputs > 1 ? `Field ${i + 1}:` : "");
														
														return h("span", {
															style: {
																display: "flex",
																flexDirection: "row",
																alignItems: "center",
																justifyContent: "center",
																width: numInputs > 1 ? "100%" : "auto",
																marginBottom: numInputs > 1 && i < (numInputs > 0 ? numInputs : 1) - 1 ? "1px" : "0",
																marginRight: numInputs > 1 ? "0" : (i < (numInputs > 0 ? numInputs : 1) - 1 ? "1px" : "0"),
															}
														}, [
															fieldLabel ? h("span", {
																style: {
																	fontSize: "10px",
																	color: "#64748b",
																	fontWeight: "500",
																	marginRight: "1px",
																	minWidth: numInputs > 1 ? "40px" : "auto",
																	flexShrink: 0,
																}
															}, fieldLabel) : null,
															h(Dropdown, {
																style: {
																	display: "inline-block",
																	minWidth: numInputs > 1 ? "40px" : "40px",
																	width: numInputs > 1 ? "100%" : "auto",
																	maxWidth: numInputs > 1 ? "100%" : "none",
																	fontSize: "11px",
																	flex: numInputs > 1 ? "1" : "0 0 auto",
																},
																values: Object.keys(this.attrValues.value || {}).filter(
																	(e) =>
																		!this.hiddenAttributes.includes(e) &&
																		!this.hiddenFromAggregators.includes(e)
																),
																value: aggregatorVals[i] || null,
																title: isSumOverSum 
																	? (i === 0 ? __('Select the numerator field') : __('Select the denominator field'))
																	: __('Select the value field for this aggregation'),
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
														]);
													}),
												],
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
													: null
											),
										]
									);
								})
							),
							h(
								"div",
								{ class: ["pvtAggregatorOrders"] },
								[
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
		outputCell(props, colspan = null) {
			const attrs = {
				class: ["pvtOutput"],
			};
			if (colspan !== null) {
				attrs.colSpan = colspan;
			}
			return h(
				"td",
				attrs,
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
				
				// Check if trying to drop a non-header field to columns
				if (e.to.classList.contains("pvtCols") && this.headerFields.length > 0) {
					if (!this.headerFields.includes(item)) {
						this.showNotification(
							`"${item}" cannot be set as a column header. Only header fields (≤50 unique values) can be used as row/column headers.`,
							"warning"
						);
						return;
					}
				}
				
				// Store original state before making any changes
				const originalCols = [...this.cols];
				const originalPropsCols = [...this.propsData.cols];
				const originalRows = [...this.rows];
				const originalPropsRows = [...this.propsData.rows];
				const cameFromRows = e.from.classList.contains("pvtRows");
				const originalRowIndex = cameFromRows ? this.rows.indexOf(item) : -1;
				
				// If dropping to pvtCols, validate FIRST before any changes
				if (e.to.classList.contains("pvtCols") && this.validateColumnDrop) {
					// Calculate the proposed state
					let proposedCols = [...originalCols];
					if (e.from.classList.contains("pvtCols")) {
						// Moving within pvtCols - simulate the move
						proposedCols.splice(e.oldIndex, 1);
						// Adjust newIndex if moving forward
						let adjustedNewIndex = e.newIndex;
						if (e.oldIndex < e.newIndex) {
							adjustedNewIndex = e.newIndex - 1;
						}
						proposedCols.splice(adjustedNewIndex, 0, item);
					} else {
						// Adding from outside
						proposedCols.splice(e.newIndex, 0, item);
					}
					
					const newIndex = e.from.classList.contains("pvtCols") ? (e.oldIndex < e.newIndex ? e.newIndex - 1 : e.newIndex) : e.newIndex;
						const validation = this.validateColumnDrop(item, originalCols, newIndex);
						
						if (!validation.allowed) {
							// Validation failed - FORCE REVERT IMMEDIATELY
							// The key issue: vuedraggable may have already mutated the arrays
							// We need to restore BOTH this.propsData.cols AND this.cols (the prop)
							
							// CRITICAL: Replace entire array references to ensure reactivity
							// For propsData, we can directly replace (it's in data())
							this.propsData.cols = [...originalPropsCols];
							
							// For the prop (this.cols), we must use splice to replace all items
							// This is necessary because this.cols is a prop from parent's shallowRef
							// Using splice ensures the parent's shallowRef detects the change
							if (this.cols.length !== originalCols.length || 
								JSON.stringify(this.cols) !== JSON.stringify(originalCols)) {
								// Clear and replace all items
								this.cols.splice(0, this.cols.length);
								originalCols.forEach(col => this.cols.push(col));
							}
							
							// CRITICAL: If the field came from rows (vertical header), restore it to rows
							if (cameFromRows && originalRowIndex !== -1) {
								// Check if item was removed from rows
								const currentRowIndex = this.rows.indexOf(item);
								if (currentRowIndex === -1) {
									// Item was removed from rows - restore it to original position
									this.propsData.rows.splice(originalRowIndex, 0, item);
									this.rows.splice(originalRowIndex, 0, item);
								} else if (currentRowIndex !== originalRowIndex) {
									// Item is in rows but at wrong position - restore to original position
									this.propsData.rows.splice(currentRowIndex, 1);
									this.rows.splice(currentRowIndex, 1);
									this.propsData.rows.splice(originalRowIndex, 0, item);
									this.rows.splice(originalRowIndex, 0, item);
								}
							}
							
							// Use nextTick as safety net - vuedraggable might update asynchronously
							nextTick(() => {
								// Check if vuedraggable changed the state
								if (JSON.stringify(this.cols) !== JSON.stringify(originalCols) ||
									JSON.stringify(this.propsData.cols) !== JSON.stringify(originalPropsCols)) {
									// Force replace again
									this.propsData.cols = [...originalPropsCols];
									this.cols.splice(0, this.cols.length);
									originalCols.forEach(col => this.cols.push(col));
								}
								
								// Restore rows if needed
								if (cameFromRows && originalRowIndex !== -1) {
									const currentRowIndex = this.rows.indexOf(item);
									if (currentRowIndex === -1) {
										// Item was removed from rows - restore it to original position
										this.propsData.rows.splice(originalRowIndex, 0, item);
										this.rows.splice(originalRowIndex, 0, item);
									} else if (currentRowIndex !== originalRowIndex) {
										// Item is in rows but at wrong position - restore to original position
										this.propsData.rows.splice(currentRowIndex, 1);
										this.rows.splice(currentRowIndex, 1);
										this.propsData.rows.splice(originalRowIndex, 0, item);
										this.rows.splice(originalRowIndex, 0, item);
									}
								}
								
								// Double-check after another tick (vuedraggable might update late)
								nextTick(() => {
									if (JSON.stringify(this.cols) !== JSON.stringify(originalCols) ||
										JSON.stringify(this.propsData.cols) !== JSON.stringify(originalPropsCols)) {
										// Final force replace
										this.propsData.cols = [...originalPropsCols];
										this.cols.splice(0, this.cols.length);
										originalCols.forEach(col => this.cols.push(col));
										this.clearWorkerCache();
									}
									
									// Final restore of rows if needed
									if (cameFromRows && originalRowIndex !== -1) {
										const currentRowIndex = this.rows.indexOf(item);
										if (currentRowIndex === -1) {
											// Item was removed from rows - restore it to original position
											this.propsData.rows.splice(originalRowIndex, 0, item);
											this.rows.splice(originalRowIndex, 0, item);
										} else if (currentRowIndex !== originalRowIndex) {
											// Item is in rows but at wrong position - restore to original position
											this.propsData.rows.splice(currentRowIndex, 1);
											this.rows.splice(currentRowIndex, 1);
											this.propsData.rows.splice(originalRowIndex, 0, item);
											this.rows.splice(originalRowIndex, 0, item);
										}
									}
								});
							});
							
							this.clearWorkerCache();
							return; // CRITICAL: Exit early - do not proceed with any changes
						}
				}
				
				// Validation passed (or no validation needed) - proceed with changes
				// But first, double-check that the item wasn't incorrectly added
				if (e.to.classList.contains("pvtCols") && !e.from.classList.contains("pvtCols")) {
					// Item is being added from outside - verify it's not already there incorrectly
					const itemIndex = this.cols.indexOf(item);
					const wasInOriginal = originalCols.indexOf(item) !== -1;
					if (itemIndex !== -1 && !wasInOriginal) {
						// Item was incorrectly added - restore original state by replacing array reference
						this.propsData.cols = [...originalPropsCols];
						this.cols.splice(0, this.cols.length, ...originalCols);
						this.clearWorkerCache();
						return; // Don't proceed
					}
				}
				
				// Proceed with changes only if validation passed
				if (e.from.classList.contains("pvtCols")) {
					this.propsData.cols.splice(e.oldIndex, 1);
					// Also update the prop directly to trigger parent reactivity
					this.cols.splice(e.oldIndex, 1);
					this.clearWorkerCache();
				}
				if (e.to.classList.contains("pvtCols")) {
					// Only add if item is not already there
					if (this.cols.indexOf(item) === -1 || e.from.classList.contains("pvtCols")) {
						this.propsData.cols.splice(e.newIndex, 0, item);
						// Also update the prop directly to trigger parent reactivity
						this.cols.splice(e.newIndex, 0, item);
						this.clearWorkerCache();
					}
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
				
				// Check if trying to drop a non-header field to rows
				if (e.to.classList.contains("pvtRows") && this.headerFields.length > 0) {
					if (!this.headerFields.includes(item)) {
						this.showNotification(
							`"${item}" cannot be set as a row header. Only header fields (≤50 unique values) can be used as row/column headers.`,
							"warning"
						);
						return;
					}
				}
				
				if (e.from.classList.contains("pvtRows")) {
					this.propsData.rows.splice(e.oldIndex, 1);
					// Also update the prop directly to trigger parent reactivity
					this.rows.splice(e.oldIndex, 1);
					this.clearWorkerCache();
				}
				if (e.to.classList.contains("pvtRows")) {
					this.propsData.rows.splice(e.newIndex, 0, item);
					// Also update the prop directly to trigger parent reactivity
					this.rows.splice(e.newIndex, 0, item);
					this.clearWorkerCache();
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
			// Virtualization props
			enableVirtualization: this.enableVirtualization !== undefined ? this.enableVirtualization : false,
			virtualizationThreshold: this.virtualizationThreshold !== undefined ? this.virtualizationThreshold : 100,
			virtualizationMaxHeight: this.virtualizationMaxHeight !== undefined ? this.virtualizationMaxHeight : 600,
		};

		const rendererCell = this.rendererCell(rendererName);
		const aggregatorCell = this.aggregatorCell(aggregatorName, vals);
		const outputCell = this.showControlPanel 
			? this.outputCell(props)
			: this.outputCell(props, 2);

		return h(
			"div",
			{
				style: {
					position: "relative",
					width: "100%",
					minWidth: "100%",
					maxWidth: "100%",
					overflow: "hidden",
					boxSizing: "border-box",
				},
			},
			[
				h(
					"table",
					{
						class: ["pvtUi"],
					},
					[
						h("tbody", [
							// First tr: Always visible (renderer and unused attributes)
							h("tr", [rendererCell, unusedAttrsCell]),
							// Second tr: Hidden when control panel is hidden (aggregator and column attributes)
							this.showControlPanel ? h("tr", [aggregatorCell, colAttrsCell]) : null,
							// Third tr: Hidden when control panel is hidden (row attributes and output)
							this.showControlPanel 
								? h("tr", [rowAttrsCell, outputCell])
								: h("tr", [outputCell]),
						]),
					]
				),
				// Notification overlay
				this.notification.show
					? h(
							"div",
							{
								class: ["pvtNotification", `pvtNotification-${this.notification.type}`],
								style: {
									position: "fixed",
									top: "20px",
									right: "20px",
									zIndex: 10000,
									padding: "16px 20px",
									borderRadius: "8px",
									boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
									maxWidth: "400px",
									display: "flex",
									alignItems: "center",
									gap: "12px",
									animation: "slideInRight 0.3s ease-out",
									cursor: "pointer",
									onClick: () => {
										this.notification.show = false;
										if (this.notificationTimer) {
											clearTimeout(this.notificationTimer);
											this.notificationTimer = null;
										}
									},
								},
							},
							[
								h("div", {
									class: ["pvtNotificationIcon"],
									style: {
										fontSize: "20px",
										lineHeight: "1",
									},
								}, this.notification.type === "warning" ? "⚠️" : "ℹ️"),
								h("div", {
									class: ["pvtNotificationMessage"],
									style: {
										flex: "1",
										fontSize: "14px",
										lineHeight: "1.5",
									},
								}, this.notification.message),
								h("button", {
									class: ["pvtNotificationClose"],
									style: {
										background: "transparent",
										border: "none",
										fontSize: "18px",
										cursor: "pointer",
										padding: "0",
										width: "24px",
										height: "24px",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										borderRadius: "4px",
										transition: "background 0.2s",
									},
									onClick: (e) => {
										e.stopPropagation();
										this.notification.show = false;
										if (this.notificationTimer) {
											clearTimeout(this.notificationTimer);
											this.notificationTimer = null;
										}
									},
								}, "×"),
							]
						)
					: null,
			]
		);
	},
};
