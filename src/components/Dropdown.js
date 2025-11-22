import { h } from "vue";
export default {
	props: {
		value: String,
		values: Array,
		changeValue: Function,
		name: String,
		id: String,
	},
	emits: ["input"],
	data() {
		return {
			generatedId: `pvt-dropdown-${Math.random().toString(36).substr(2, 9)}`
		};
	},
	render() {
		// Generate unique id/name if not provided
		const uniqueId = this.id || this.generatedId;
		const uniqueName = this.name || uniqueId;
		
		return h(
			"select",
			{
				class: "pvtDropdown",
				name: uniqueName,
				id: uniqueId,
				onChange: (e) => this.$emit("input", e.target.value),
			},
			this.values.map((val) => {
				return h(
					"option",
					{
						value: val,
						key: `dropdown-${val}`,
						selected: val === this.value,
					},
					val
				);
			})
		);
	},
};