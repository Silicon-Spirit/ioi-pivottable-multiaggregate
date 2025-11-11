import common from "./helper/defaultProps";
import DraggableAttribute from "./DraggableAttribute";
import Dropdown from "./Dropdown";
import Pivottable from "./Pivottable";
import { PivotData, getSort, aggregators, sortAs } from "./helper/utils";
import draggable from "vuedraggable";
import TableRenderer from "./TableRenderer";
import * as Vue from "vue";
import "./pivottable.css";

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
		...common.props,
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
			return Object.keys(this.attrValues)
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
			return Object.keys(this.attrValues)
				.filter(
					(e) =>
						!this.propsData.rows.includes(e) &&
						!this.propsData.cols.includes(e) &&
						!this.hiddenAttributes.includes(e) &&
						!this.hiddenFromDragDrop.includes(e)
				)
				.sort(sortAs(this.unusedOrder));
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
			},
			openStatus: {},
			attrValues: {},
			unusedOrder: [],
			zIndices: {},
			maxZIndex: 1000,
			openDropdown: false,
			materializedInput: [],
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
	beforeUpdated(nextProps) {
		this.materializeInput(nextProps.data);
	},
	created() {
		this.materializeInput(this.data);
		this.propsData.vals = this.vals.slice();
		this.propsData.rows = this.rows;
		this.propsData.cols = this.cols;
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
		Object.keys(this.attrValues).map(this.assignValue);
		Object.keys(this.openStatus).map(this.assignValue);
	},
	watch: {
		data() {
			this.materializeInput(this.data);
			this.propsData.vals = this.vals.slice();
			this.propsData.rows = this.rows;
			this.propsData.cols = this.cols;
			this.unusedOrder = this.unusedAttrs;
			Object.keys(this.attrValues).map(this.assignValue);
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
			const required = aggregatorList.reduce((largest, name) => {
				if (!aggregators[name]) {
					return largest;
				}
				const numInputs =
					aggregators[name]([])().numInputs || 0;
				return Math.max(largest, numInputs);
			}, 0);

			const allowedAttributes = this.valueAttrOptions;
			const fallbackAttr =
				allowedAttributes[0] ||
				this.propsData.vals[0] ||
				this.vals[0] ||
				null;

			const nextVals = this.propsData.vals.slice(0, required);
			while (nextVals.length < required) {
				const suggestion =
					allowedAttributes[nextVals.length] || fallbackAttr || null;
				nextVals.push(suggestion);
			}

			if (required === 0) {
				this.propsData.vals = [];
			} else {
				this.propsData.vals = nextVals;
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
			const duplicateIndex = current.findIndex((item, idx) => item === value && idx !== index);
			if (duplicateIndex !== -1) {
				current.splice(duplicateIndex, 1);
			}
			current[index] = value;
			this.updateAggregatorSelection(current);
		},
		updateValueFilter({ attribute, valueFilter }) {
			this.propsData.valueFilter[attribute] = { ...valueFilter };
			cur_list.pivot_value_filter = this.propsData.valueFilter
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
			this.materializedInput = materializedInput;
			this.attrValues = attrValues;
		},
		makeDnDCell(items, onChange, classes, h) {
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
							attrValues: this.attrValues[element],
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
		rendererCell(rendererName, h) {
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
		aggregatorCell(aggregatorName, vals, h) {
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
								this.selectedAggregators.map((name, index) =>
									h(
										"div",
										{
											class: ["pvtAggregatorOption"],
											key: `aggregator-${name}-${index}`,
										},
										[
											h(Dropdown, {
												style: {
													display: "inline-block",
												},
												values: this.availableAggregators,
												value: name,
												title: __('Select the aggregation method for the data'),
												onInput: (value) => {
													this.changeAggregator(index, value);
												},
											}),
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
									)
								)
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
							this.numValsAllowed > 0
								? new Array(this.numValsAllowed).fill().map((n, i) => [
										h(Dropdown, {
											values: Object.keys(this.attrValues).filter(
												(e) =>
													!this.hiddenAttributes.includes(e) &&
													!this.hiddenFromAggregators.includes(e)
											),
											value: vals[i],
											onInput: (value) => {
												this.propsData.vals.splice(i, 1, value);
											},
										}),
									])
								: undefined,
						]
					);
		},
		outputCell(props, h) {
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
			Vue.h
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
			Vue.h
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
			Vue.h
		);
		const props = {
			...this.$props,
			data: this.materializedInput,
			rowOrder: this.propsData.rowOrder,
			colOrder: this.propsData.colOrder,
			valueFilter: this.propsData.valueFilter,
			rows: this.propsData.rows,
			cols: this.propsData.cols,
			rendererName,
			aggregatorName,
			aggregatorNames,
			vals,
		};

		const rendererCell = this.rendererCell(rendererName, Vue.h);
		const aggregatorCell = this.aggregatorCell(aggregatorName, vals, Vue.h);
		const outputCell = this.outputCell(props, Vue.h);

		return Vue.h(
			"table",
			{
				class: ["pvtUi"],
			},
			[
				Vue.h("tbody", [
					Vue.h("tr", [rendererCell, unusedAttrsCell]),
					Vue.h("tr", [aggregatorCell, colAttrsCell]),
					Vue.h("tr", [rowAttrsCell, outputCell]),
				]),
			]
		);
	},
};