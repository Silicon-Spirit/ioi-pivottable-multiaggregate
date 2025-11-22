import TableRenderer from "./TableRenderer.js";
import defaultProps from "../utils/defaultProps.js";
import { h } from "vue";
export default {
	name: "vue-pivottable",
	props: defaultProps.props,
	computed: {
		renderers() {
			return TableRenderer[
				this.rendererName in TableRenderer
					? this.rendererName
					: Object.keys(TableRenderer)[0]
			];
		},
	},
	render() {
		return h(this.renderers, { ...this.$props });
	},
};