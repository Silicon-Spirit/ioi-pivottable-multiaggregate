// Helper function to get translation function
const getTranslation = () => {
	if (typeof window !== 'undefined' && window.__) {
		return window.__;
	}
	// Fallback if __ is not available
	return (text, args) => {
		if (args && args.length) {
			return text.replace(/\{(\d+)\}/g, (match, index) => args[parseInt(index)] || match);
		}
		return text;
	};
};

const __ = getTranslation();

const addSeparators = function (nStr, thousandsSep, decimalSep) {
	const x = String(nStr).split(".");
	let x1 = x[0];
	const x2 = x.length > 1 ? decimalSep + x[1] : "";
	const rgx = /(\d+)(\d{3})/;
	while (rgx.test(x1)) {
		x1 = x1.replace(rgx, `$1${thousandsSep}$2`);
	}
	return x1 + x2;
};

const getFormatOptionsFromFrappe = () => {
	// Web Workers don't have access to window object
	if (typeof window === 'undefined' || !window.get_number_format || !window.get_number_format_info) {
		// Return default format options for worker context or when window functions are unavailable
		return {
			thousandsSep: ',',
			decimalSep: '.',
			digitsAfterDecimal: 2,
		};
	}
	
	const format = window.get_number_format();
	const format_info = window.get_number_format_info(format)

	return {
		thousandsSep: format_info.group_sep,
		decimalSep: format_info.decimal_str,
		digitsAfterDecimal: format_info.precision,
	};
};

const numberFormat = function (optsIn) {
	const frappeFormat = getFormatOptionsFromFrappe();
	const defaults = {
		digitsAfterDecimal: frappeFormat.digitsAfterDecimal,
		scaler: 1,
		thousandsSep: frappeFormat.thousandsSep,
		decimalSep: frappeFormat.decimalSep,
		prefix: "",
		suffix: "",
	};
	const opts = Object.assign({}, defaults, optsIn);
	return function (x) {
		if (isNaN(x) || !isFinite(x)) {
			return "";
		}
		const result = addSeparators(
			(opts.scaler * x).toFixed(opts.digitsAfterDecimal),
			opts.thousandsSep,
			opts.decimalSep
		);
		return `${opts.prefix}${result}${opts.suffix}`;
	};
};

const rx = /(\d+)|(\D+)/g;
const rd = /\d/;
const rz = /^0/;
const naturalSort = (as, bs) => {
	// nulls first
	if (bs !== null && as === null) {
		return -1;
	}
	if (as !== null && bs === null) {
		return 1;
	}

	// then raw NaNs
	if (typeof as === "number" && isNaN(as)) {
		return -1;
	}
	if (typeof bs === "number" && isNaN(bs)) {
		return 1;
	}

	// numbers and numbery strings group together
	const nas = Number(as);
	const nbs = Number(bs);
	if (nas < nbs) {
		return -1;
	}
	if (nas > nbs) {
		return 1;
	}

	// within that, true numbers before numbery strings
	if (typeof as === "number" && typeof bs !== "number") {
		return -1;
	}
	if (typeof bs === "number" && typeof as !== "number") {
		return 1;
	}
	if (typeof as === "number" && typeof bs === "number") {
		return 0;
	}

	// 'Infinity' is a textual number, so less than 'A'
	if (isNaN(nbs) && !isNaN(nas)) {
		return -1;
	}
	if (isNaN(nas) && !isNaN(nbs)) {
		return 1;
	}

	// finally, "smart" string sorting per http://stackoverflow.com/a/4373421/112871
	let a = String(as);
	let b = String(bs);
	if (a === b) {
		return 0;
	}
	if (!rd.test(a) || !rd.test(b)) {
		return a > b ? 1 : -1;
	}

	// special treatment for strings containing digits
	a = a.match(rx);
	b = b.match(rx);
	while (a.length && b.length) {
		const a1 = a.shift();
		const b1 = b.shift();
		if (a1 !== b1) {
			if (rd.test(a1) && rd.test(b1)) {
				return a1.replace(rz, ".0") - b1.replace(rz, ".0");
			}
			return a1 > b1 ? 1 : -1;
		}
	}
	return a.length - b.length;
};
const sortAs = function (order) {
	const mapping = {};

	// sort lowercased keys similarly
	const lMapping = {};
	for (const i in order) {
		const x = order[i];
		mapping[x] = i;
		if (typeof x === "string") {
			lMapping[x.toLowerCase()] = i;
		}
	}
	return function (a, b) {
		if (a in mapping && b in mapping) {
			return mapping[a] - mapping[b];
		} else if (a in mapping) {
			return -1;
		} else if (b in mapping) {
			return 1;
		} else if (a in lMapping && b in lMapping) {
			return lMapping[a] - lMapping[b];
		} else if (a in lMapping) {
			return -1;
		} else if (b in lMapping) {
			return 1;
		}
		return naturalSort(a, b);
	};
};

const getSort = function (sorters, attr) {
	if (sorters) {
		if (typeof sorters === "function") {
			const sort = sorters(attr);
			if (typeof sort === "function") {
				return sort;
			}
		} else if (attr in sorters) {
			return sorters[attr];
		}
	}
	return naturalSort;
};

// aggregator templates default to US number formatting but this is overrideable
const usFmt = numberFormat();
const usFmtInt = numberFormat({ digitsAfterDecimal: 0 });
const usFmtPct = numberFormat({
	digitsAfterDecimal: 1,
	scaler: 100,
	suffix: "%",
});

const aggregatorTemplates = {
	count(formatter = usFmtInt) {
		return () =>
			function (data, rowKey, colKey) {
				return {
					count: 0,
					push() {
						this.count++;
					},
					value() {
						return this.count;
					},
					format: formatter,
					numInputs: 0,  // ✅ Add this: Count doesn't need any value fields
				};
			};
	},

	uniques(fn, formatter = usFmtInt) {
		return function ([attr]) {
			return function (data, rowKey, colKey) {
				// Store attr in closure so it's accessible in push method
				const attrName = attr;
				return {
					uniq: [],
					push(record) {
						// Standard pivot table behavior for List Unique Values:
						// 1. If attr is undefined/null, skip this record (no attribute to collect)
						// 2. If attr is defined, get record[attr] (even if undefined/null - those are valid unique values)
						if (attrName === undefined || attrName === null) {
							return;
						}
						
						// Get the value from the record (can be any type including undefined, null, NaN, objects)
						const value = record[attrName];
						
						// Check if this value is already in the unique array
						// Standard implementation uses strict equality with special handling for NaN
						let isUnique = true;
						for (let i = 0; i < this.uniq.length; i++) {
							const existing = this.uniq[i];
							// Special case: NaN comparison (NaN !== NaN in JavaScript)
							if (typeof value === 'number' && typeof existing === 'number' && isNaN(value) && isNaN(existing)) {
								isUnique = false;
								break;
							}
							// Standard strict equality check
							// This handles: null, undefined, primitives, objects (by reference)
							if (value === existing) {
								isUnique = false;
								break;
							}
						}
						// Add the value if it's unique
						// Note: null, undefined, NaN, and objects are all valid unique values
						if (isUnique) {
							this.uniq.push(value);
						}
					},
					// Expose uniq array for debugging
					getUniqArray() {
						return this.uniq;
					},
					value() {
						// Ensure we return the result of fn applied to the unique array
						// For listUnique, fn is (x) => x.join(", "), so this returns a comma-separated string
						if (this.uniq && this.uniq.length > 0 && typeof fn === 'function') {
							const result = fn(this.uniq);
							// Debug: log for List Unique Values aggregators
							if (attrName && this.uniq.length > 0) {
							const isListUnique = typeof result === 'string' && result.includes(',');
							if (isListUnique || (this.uniq.length === 1 && attrName.includes('mark'))) {
								// Debug info for List Unique Values aggregator
							}
							}
							return result;
						}
						// Fallback: if uniq is empty or fn is not a function, return empty string
						return '';
					},
					format: formatter,
					numInputs: typeof attrName !== "undefined" ? 0 : 1,
				};
			};
		};
	},

	sum(formatter = usFmt) {
		return function ([attr]) {
			return function (data, rowKey, colKey) {
				return {
					sum: 0,
					push(record) {
						// Handle undefined attr gracefully
						if (attr === undefined || attr === null) {
							return;
						}
						const value = record[attr];
						if (value !== undefined && value !== null && !isNaN(parseFloat(value))) {
							this.sum += parseFloat(value);
						}
					},
					value() {
						return this.sum;
					},
					format: formatter,
					numInputs: typeof attr !== "undefined" ? 0 : 1,
				};
			};
		};
	},

	extremes(mode, formatter = usFmt) {
		return function ([attr]) {
			return function (data, rowKey, colKey) {
				return {
					val: null,
					sorter: getSort(
						typeof data !== "undefined" ? data.sorters : null,
						attr
					),
					push(record) {
						// Handle undefined attr gracefully
						if (attr === undefined || attr === null) {
							return;
						}
						let x = record[attr];
						if (x === undefined || x === null) {
							return;
						}
						if (["min", "max"].includes(mode)) {
							x = parseFloat(x);
							if (!isNaN(x)) {
								this.val = Math[mode](x, this.val !== null ? this.val : x);
							}
						}
						if (
							mode === "first" &&
							this.sorter(x, this.val !== null ? this.val : x) <= 0
						) {
							this.val = x;
						}
						if (
							mode === "last" &&
							this.sorter(x, this.val !== null ? this.val : x) >= 0
						) {
							this.val = x;
						}
					},
					value() {
						return this.val;
					},
					format(x) {
						if (isNaN(x)) {
							return x;
						}
						return formatter(x);
					},
					numInputs: typeof attr !== "undefined" ? 0 : 1,
				};
			};
		};
	},

	quantile(q, formatter = usFmt) {
		return function ([attr]) {
			return function (data, rowKey, colKey) {
				return {
					vals: [],
					push(record) {
						// Handle undefined attr gracefully
						if (attr === undefined || attr === null) {
							return;
						}
						const value = record[attr];
						if (value === undefined || value === null) {
							return;
						}
						const x = parseFloat(value);
						if (!isNaN(x)) {
							this.vals.push(x);
						}
					},
					value() {
						if (this.vals.length === 0) {
							return null;
						}
						this.vals.sort((a, b) => a - b);
						const i = (this.vals.length - 1) * q;
						return (this.vals[Math.floor(i)] + this.vals[Math.ceil(i)]) / 2.0;
					},
					format: formatter,
					numInputs: typeof attr !== "undefined" ? 0 : 1,
				};
			};
		};
	},

	runningStat(mode = "mean", ddof = 1, formatter = usFmt) {
		return function ([attr]) {
			return function (data, rowKey, colKey) {
				return {
					n: 0.0,
					m: 0.0,
					s: 0.0,
					push(record) {
						// Handle undefined attr gracefully
						if (attr === undefined || attr === null) {
							return;
						}
						const value = record[attr];
						if (value === undefined || value === null) {
							return;
						}
						const x = parseFloat(value);
						if (isNaN(x)) {
							return;
						}
						this.n += 1.0;
						if (this.n === 1.0) {
							this.m = x;
						}
						const mNew = this.m + (x - this.m) / this.n;
						this.s = this.s + (x - this.m) * (x - mNew);
						this.m = mNew;
					},
					value() {
						if (mode === "mean") {
							if (this.n === 0) {
								return 0 / 0;
							}
							return this.m;
						}
						if (this.n <= ddof) {
							return 0;
						}
						switch (mode) {
							case "var":
								return this.s / (this.n - ddof);
							case "stdev":
								return Math.sqrt(this.s / (this.n - ddof));
							default:
								throw new Error(__("unknown mode for runningStat"));
						}
					},
					format: formatter,
					numInputs: typeof attr !== "undefined" ? 0 : 1,
				};
			};
		};
	},

	sumOverSum(formatter = usFmt) {
		return function ([num, denom]) {
			return function (data, rowKey, colKey) {
				return {
					sumNum: 0,
					sumDenom: 0,
					push(record) {
						// Handle undefined fields gracefully
						if (num !== undefined && num !== null) {
							const numValue = record[num];
							if (numValue !== undefined && numValue !== null && !isNaN(parseFloat(numValue))) {
								this.sumNum += parseFloat(numValue);
							}
						}
						if (denom !== undefined && denom !== null) {
							const denomValue = record[denom];
							if (denomValue !== undefined && denomValue !== null && !isNaN(parseFloat(denomValue))) {
								this.sumDenom += parseFloat(denomValue);
							}
						}
					},
					value() {
						return this.sumDenom !== 0 ? this.sumNum / this.sumDenom : 0;
					},
					format: formatter,
					numInputs: 2, // Always requires 2 inputs (numerator and denominator)
				};
			};
		};
	},

	fractionOf(wrapped, type = "total", formatter = usFmtPct) {
		return (...x) => {
			// Create the wrapped aggregator to determine its structure
			const sampleWrapped = wrapped(...Array.from(x || []));
			const wrappedNumInputs = sampleWrapped().numInputs;
			
			return function (data, rowKey, colKey) {
				return {
					selector: { total: [[], []], row: [rowKey, []], col: [[], colKey] }[
						type
					],
					inner: wrapped(...Array.from(x || []))(data, rowKey, colKey),
					push(record) {
						this.inner.push(record);
					},
					format: formatter,
					value() {
						const selector = this.selector || [];
						const totalAggregator = data.getAggregator(...Array.from(selector));
						
						// Handle case where getAggregator returns a collection (multiple aggregators)
						let baseAggregator = totalAggregator;
						
						// Check if it's a collection (object with multiple aggregators)
						if (totalAggregator && typeof totalAggregator === 'object' && !totalAggregator.inner && !totalAggregator.value) {
							// It's a collection, find the base aggregator
							// For "Sum as Fraction of Total", we need to find "Sum" in the collection
							// Try common base aggregator names first
							const baseNames = [__("Sum"), __("Integer Sum"), __("Count"), __("Average")];
							for (const baseName of baseNames) {
								if (totalAggregator[baseName] && typeof totalAggregator[baseName].value === 'function') {
									baseAggregator = totalAggregator[baseName];
									break;
								}
							}
							
							// If still not found, try all aggregator names in the collection
							if (!baseAggregator || (typeof baseAggregator === 'object' && !baseAggregator.value)) {
								const aggregatorNames = data.getAggregatorNames();
								for (const aggName of aggregatorNames) {
									// Skip fraction aggregators (they have .inner property)
									if (totalAggregator[aggName] && 
										typeof totalAggregator[aggName].value === 'function' &&
										!totalAggregator[aggName].inner) {
										baseAggregator = totalAggregator[aggName];
										break;
									}
								}
							}
						}
						
						// Get the denominator value
						let denominatorValue = 0;
						if (baseAggregator) {
							if (baseAggregator.inner && typeof baseAggregator.inner.value === 'function') {
								// It's a wrapped aggregator (like another fractionOf)
								denominatorValue = baseAggregator.inner.value();
							} else if (typeof baseAggregator.value === 'function') {
								// It's a base aggregator
								denominatorValue = baseAggregator.value();
							}
						}
						
						const numeratorValue = this.inner.value();
						
						if (denominatorValue === 0 || denominatorValue === null || denominatorValue === undefined) {
							return 0;
						}
						
						return numeratorValue / denominatorValue;
					},
					numInputs: wrappedNumInputs,
				};
				};
			};
	},
};

aggregatorTemplates.countUnique = (f) =>
	aggregatorTemplates.uniques((x) => x.length, f);
aggregatorTemplates.listUnique = (s) =>
	aggregatorTemplates.uniques(
		(x) => x.join(s),
		(x) => x
	);
aggregatorTemplates.max = (f) => aggregatorTemplates.extremes("max", f);
aggregatorTemplates.min = (f) => aggregatorTemplates.extremes("min", f);
aggregatorTemplates.first = (f) => aggregatorTemplates.extremes("first", f);
aggregatorTemplates.last = (f) => aggregatorTemplates.extremes("last", f);
aggregatorTemplates.median = (f) => aggregatorTemplates.quantile(0.5, f);
aggregatorTemplates.average = (f) =>
	aggregatorTemplates.runningStat("mean", 1, f);
aggregatorTemplates.var = (ddof, f) =>
	aggregatorTemplates.runningStat("var", ddof, f);
aggregatorTemplates.stdev = (ddof, f) =>
	aggregatorTemplates.runningStat("stdev", ddof, f);

// default aggregators & renderers use US naming and number formatting
let aggregators = ((tpl) => ({
	"Count": tpl.count(usFmtInt),
	"Count Unique Values": tpl.countUnique(usFmtInt),
	"List Unique Values": tpl.listUnique(", "),
	"Sum": tpl.sum(usFmt),
	"Integer Sum": tpl.sum(usFmtInt),
	"Average": tpl.average(usFmt),
	"Median": tpl.median(usFmt),
	"Sample Variance": tpl.var(1, usFmt),
	"Sample Standard Deviation": tpl.stdev(1, usFmt),
	"Minimum": tpl.min(usFmt),
	"Maximum": tpl.max(usFmt),
	"First": tpl.first(usFmt),
	"Last": tpl.last(usFmt),
	"Sum over Sum": tpl.sumOverSum(usFmt),
	"Sum as Fraction of Total": tpl.fractionOf(tpl.sum(), "total", usFmtPct),
	"Sum as Fraction of Rows": tpl.fractionOf(tpl.sum(), "row", usFmtPct),
	"Sum as Fraction of Columns": tpl.fractionOf(tpl.sum(), "col", usFmtPct),
	"Count as Fraction of Total": tpl.fractionOf(tpl.count(), "total", usFmtPct),
	"Count as Fraction of Rows": tpl.fractionOf(tpl.count(), "row", usFmtPct),
	"Count as Fraction of Columns": tpl.fractionOf(tpl.count(), "col", usFmtPct),
}))(aggregatorTemplates);

let translated_aggregators = {};

Object.keys(aggregators).forEach((key) => {
	translated_aggregators[__(key)] = aggregators[key];
});

aggregators = translated_aggregators;

const locales = {
	en: {
		aggregators,
		localeStrings: {
			renderError: __("An error occurred rendering the PivotTable results."),
			computeError: __("An error occurred computing the PivotTable results."),
			uiRenderError: __("An error occurred rendering the PivotTable UI."),
			selectAll: __("Select All"),
			selectNone: __("Select None"),
			tooMany: __("(too many to list)"),
			filterResults: __("Filter values"),
			apply: __("Apply"),
			cancel: __("Cancel"),
			totals: __("Totals"),
			vs: __("vs"),
			by: __("by"),
		},
	},
};

// dateFormat deriver l10n requires month and day names to be passed in directly
const mthNamesEn = [
	__("Jan"),
	__("Feb"),
	__("Mar"),
	__("Apr"),
	__("May"),
	__("Jun"),
	__("Jul"),
	__("Aug"),
	__("Sep"),
	__("Oct"),
	__("Nov"),
	__("Dec"),
];
const dayNamesEn = [__("Sun"), __("Mon"), __("Tue"), __("Wed"), __("Thu"), __("Fri"), __("Sat")];
const zeroPad = (number) => `0${number}`.substr(-2, 2); // eslint-disable-line no-magic-numbers

const derivers = {
	bin(col, binWidth) {
		return (record) => record[col] - (record[col] % binWidth);
	},
	dateFormat(
		col,
		formatString,
		utcOutput = false,
		mthNames = mthNamesEn,
		dayNames = dayNamesEn
	) {
		const utc = utcOutput ? "UTC" : "";
		return function (record) {
			const date = new Date(Date.parse(record[col]));
			if (isNaN(date)) {
				return "";
			}
			return formatString.replace(/%(.)/g, function (m, p) {
				switch (p) {
					case "y":
						return date[`get${utc}FullYear`]();
					case "m":
						return zeroPad(date[`get${utc}Month`]() + 1);
					case "n":
						return mthNames[date[`get${utc}Month`]()];
					case "d":
						return zeroPad(date[`get${utc}Date`]());
					case "w":
						return dayNames[date[`get${utc}Day`]()];
					case "x":
						return date[`get${utc}Day`]();
					case "H":
						return zeroPad(date[`get${utc}Hours`]());
					case "M":
						return zeroPad(date[`get${utc}Minutes`]());
					case "S":
						return zeroPad(date[`get${utc}Seconds`]());
					default:
						return `%${p}`;
				}
			});
		};
	},
};

export {
	aggregatorTemplates,
	aggregators,
	derivers,
	locales,
	naturalSort,
	numberFormat,
	getSort,
	sortAs
};