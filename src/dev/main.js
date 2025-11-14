// Development entry point
// Note: Frappe mocks are set up in index.html before this module loads
import { createApp, h } from 'vue';
import PivottableUi from '../components/PivottableUi.js';
import '../styles/pivottable.css';

const app = createApp({
	components: {
		// Register component locally in the app with all name variations
		PivottableUi,
		'pivottable-ui': PivottableUi,
		'pivottableui': PivottableUi,
		'vue-pivottable-ui': PivottableUi
	},
	data() {
		return {
			data: [
				{ color: "blue", shape: "circle", size: 10, count: 5 },
				{ color: "red", shape: "square", size: 20, count: 3 },
				{ color: "blue", shape: "triangle", size: 15, count: 7 },
				{ color: "green", shape: "circle", size: 12, count: 4 },
				{ color: "red", shape: "circle", size: 18, count: 6 },
				{ color: "blue", shape: "square", size: 22, count: 2 },
				{ color: "green", shape: "triangle", size: 14, count: 8 },
				{ color: "red", shape: "triangle", size: 16, count: 1 },
			],
			rows: ['color'],
			cols: ['shape'],
			vals: ['count'],
			aggregatorName: 'Sum',
			rendererName: 'Table'
		};
	}
});

// Also register globally with all possible name variations for extra safety
app.component('PivottableUi', PivottableUi);
app.component('pivottable-ui', PivottableUi);
app.component('pivottableui', PivottableUi); // Lowercase without hyphen
app.component('vue-pivottable-ui', PivottableUi); // Component's internal name

app.mount('#app');

