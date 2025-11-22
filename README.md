# Vue3 PivotTable for Frappe Framework

A powerful and flexible pivot table component built with Vue 3, designed specifically for use in Frappe Framework applications.

## Features

- 🎯 **Drag & Drop Interface**: Intuitive drag-and-drop interface for configuring pivot tables
- 📊 **Multiple Renderers**: Support for tables, heatmaps, and various chart types (bar, line, pie, percentage)
- 🔢 **Rich Aggregators**: Count, sum, average, median, min, max, and many more aggregation functions
- 🎨 **Customizable**: Highly customizable with support for custom renderers and aggregators
- 🌐 **Frappe Integration**: Built-in integration with Frappe's number formatting and translation system
- 📤 **Export Support**: Export pivot tables to XLSX format
- 🎛️ **Filtering**: Advanced filtering capabilities for rows and columns

## Project Structure

```
vue3-pivottable/
├── src/
│   ├── components/          # Vue components
│   │   ├── Pivottable.js    # Core pivot table component
│   │   ├── PivottableUi.js  # UI component with drag-and-drop
│   │   ├── TableRenderer.js # Renderers (table, charts, export)
│   │   ├── DraggableAttribute.js
│   │   └── Dropdown.js
│   ├── utils/               # Utility functions
│   │   ├── defaultProps.js
│   │   └── utils.js
│   ├── styles/              # Stylesheets
│   │   └── pivottable.css
│   └── entry/               # Entry points
│       ├── index.js         # Main entry point
│       └── frappe.js       # Frappe-specific entry point
├── dist/                    # Build output
├── vite.config.js          # Vite configuration
├── vite.frappe.config.js   # Frappe build configuration
└── package.json
```

## Installation

```bash
npm install vue3-pivottable
```

## Dependencies

- Vue 3.x (peer dependency)
- vuedraggable (for drag and drop functionality)
- xlsx (for Excel export)

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build for production
npm run build

# Preview build
npm run preview
```

## Usage

### Basic Example

```javascript
import { createApp } from 'vue';
import { PivottableUi } from 'vue3-pivottable';
import 'vue3-pivottable/style';

const app = createApp({
  data() {
    return {
      data: [
        { color: "blue", shape: "circle", size: 10 },
        { color: "red", shape: "square", size: 20 },
        { color: "blue", shape: "triangle", size: 15 },
        // ... more data
      ],
      rows: ['color'],
      cols: ['shape'],
      aggregatorName: 'Count',
      rendererName: 'Table'
    };
  },
  template: `
    <PivottableUi
      :data="data"
      :rows="rows"
      :cols="cols"
      :aggregatorName="aggregatorName"
      :rendererName="rendererName"
    />
  `
});

app.component('PivottableUi', PivottableUi);
app.mount('#app');
```

### With Frappe Framework

#### Option 1: Using the Frappe Entry Point

```javascript
// In your Frappe app's JS file
import VuePivottable from 'vue3-pivottable/frappe';
import 'vue3-pivottable/style';

// Register the plugin
if (window.Vue) {
  window.Vue.use(VuePivottable);
}

// Or use components directly
import { PivottableUi } from 'vue3-pivottable/frappe';
```

#### Option 2: Manual Integration

```javascript
import { PivottableUi } from 'vue3-pivottable';
import 'vue3-pivottable/style';

// In your Frappe app
frappe.ui.form.on('Your DocType', {
  refresh(frm) {
    if (!frm.pivot_table) {
      frm.pivot_table = frappe.ui.form.make_control({
        parent: frm.fields_dict.your_field.wrapper,
        df: {
          fieldtype: 'HTML',
          options: '<div id="pivot-container"></div>'
        }
      });
      
      // Create Vue app
      const { createApp } = Vue;
      const app = createApp({
        data() {
          return {
            data: frm.doc.your_data || [],
            rows: [],
            cols: [],
            aggregatorName: __('Count'),
            rendererName: __('Table')
          };
        }
      });
      
      app.component('PivottableUi', PivottableUi);
      app.mount('#pivot-container');
    }
  }
});
```

## Components

### PivottableUi

The main UI component with drag-and-drop interface.

**Props:**
- `data` (Array/Object/Function, required): The data to pivot
- `rows` (Array): Array of attribute names for rows
- `cols` (Array): Array of attribute names for columns
- `vals` (Array): Array of attribute names for values
- `aggregatorName` (String): Name of the aggregator to use
- `rendererName` (String): Name of the renderer to use
- `rowTotal` (Boolean): Show row totals (default: true)
- `colTotal` (Boolean): Show column totals (default: true)
- `valueFilter` (Object): Filter values by attribute
- `sorters` (Object/Function): Custom sorters for attributes
- `derivedAttributes` (Object): Custom derived attributes
- `hiddenAttributes` (Array): Attributes to hide from UI
- `hiddenFromAggregators` (Array): Attributes hidden from aggregator selection
- `hiddenFromDragDrop` (Array): Attributes hidden from drag-drop
- `sortonlyFromDragDrop` (Array): Attributes that can only be sorted, not dragged
- `disabledFromDragDrop` (Array): Attributes disabled from drag-drop
- `menuLimit` (Number): Maximum number of items in filter menu (default: 500)

### Pivottable

The core pivot table component without UI controls.

**Props:** Same as PivottableUi, but without UI-specific props.

## Renderers

Available renderers:
- **Table**: Standard table view
- **Table Heatmap**: Full heatmap coloring
- **Table Col Heatmap**: Column-based heatmap
- **Table Row Heatmap**: Row-based heatmap
- **Bar Chart**: Bar chart visualization
- **Line Chart Straight**: Straight line chart
- **Line Chart Curved**: Curved line chart
- **Pie Chart**: Pie chart visualization
- **Percentage Chart**: Percentage chart
- **Export**: Export to XLSX

## Aggregators

Available aggregators:
- Count
- Count Unique Values
- List Unique Values
- Sum
- Integer Sum
- Average
- Median
- Sample Variance
- Sample Standard Deviation
- Minimum
- Maximum
- First
- Last
- Sum over Sum
- Sum as Fraction of Total
- Sum as Fraction of Rows
- Sum as Fraction of Columns
- Count as Fraction of Total
- Count as Fraction of Rows
- Count as Fraction of Columns

## Customization

### Custom Aggregator

```javascript
import { aggregatorTemplates } from 'vue3-pivottable';

const customAggregator = aggregatorTemplates.sum()(['amount']);
```

### Custom Renderer

```javascript
import { makeRenderer } from 'vue3-pivottable';

const customRenderer = makeRenderer({
  name: 'custom-renderer',
  mode: 'table'
});
```

## Building

The project uses Vite for building. Run:

```bash
npm run build
```

This will create:
- `dist/vue3-pivottable.es.js` - ES module build
- `dist/vue3-pivottable.cjs.js` - CommonJS build
- `dist/vue3-pivottable.umd.js` - UMD build
- `dist/vue3-pivottable-frappe.es.js` - Frappe ES module build
- `dist/vue3-pivottable-frappe.umd.js` - Frappe UMD build
- `dist/style.css` - Compiled styles

## Styling

The component includes default styles. Import them:

```javascript
import 'vue3-pivottable/style';
```

You can override these styles to match your application's design.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
