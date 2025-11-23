// Helper function to get translation function
const getTranslation = () => {
	if (typeof window !== 'undefined' && window.__) {
		return window.__;
	}
	// Fallback if __ is not available
	return (text) => text;
};

const __ = getTranslation();

export default {
	props: {
		data: {
			type: [Array, Object, Function],
			required: true,
		},
		aggregatorNames: {
			type: Array,
			default: function () {
				return [];
			},
		},
		cols: {
			type: Array,
			default: function () {
				return [];
			},
		},
		rendererName: {
			type: String,
			default: __("Table"),
		},
		rowTotal: {
			type: Boolean,
			default: true,
		},
		colTotal: {
			type: Boolean,
			default: true,
		},
		rows: {
			type: Array,
			default: function () {
				return [];
			},
		},
		vals: {
			type: Array,
			default: function () {
				return [];
			},
		},
		valueFilter: {
			type: Object,
			default: function () {
				return {};
			},
		},
		sorters: {
			type: [Function, Object],
			default: function () {
				return {};
			},
		},
		derivedAttributes: {
			type: Object,
			default: function () {
				return {};
			},
		},
		rowOrder: {
			type: String,
			default: "key_a_to_z",
			validator: function (value) {
				return (
					["key_a_to_z", "value_a_to_z", "value_z_to_a"].indexOf(value) !== -1
				);
			},
		},
		colOrder: {
			type: String,
			default: "key_a_to_z",
			validator: function (value) {
				return (
					["key_a_to_z", "value_a_to_z", "value_z_to_a"].indexOf(value) !== -1
				);
			},
		},
		aggregatorVals: {
			type: Object,
			default: function () {
				return {};
			},
		},
	},
};