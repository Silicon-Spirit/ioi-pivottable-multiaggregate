# Quick Start Guide

Get started with vue3-pivottable in minutes!

## Installation

```bash
npm install vue3-pivottable
```

## Basic Usage

### 1. Import and Use Component

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
      ],
      rows: ['color'],
      cols: ['shape'],
      aggregatorName: 'Count',
      rendererName: 'Table'
    };
  }
});

app.component('PivottableUi', PivottableUi);
app.mount('#app');
```

### 2. In Frappe Framework

```javascript
// Import the Frappe entry point
import VuePivottable from 'vue3-pivottable/frappe';
import 'vue3-pivottable/style';

// In your form
frappe.ui.form.on('Your DocType', {
  refresh(frm) {
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
    
    app.use(VuePivottable);
    app.mount('#pivot-container');
  }
});
```

## Minimal Example

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <link rel="stylesheet" href="path/to/vue3-pivottable/style.css">
</head>
<body>
  <div id="app">
    <PivottableUi :data="data" />
  </div>
  
  <script type="module">
    import { PivottableUi } from './dist/vue3-pivottable.es.js';
    
    const { createApp } = Vue;
    const app = createApp({
      data() {
        return {
          data: [
            { a: 1, b: 2, c: 3 },
            { a: 2, b: 3, c: 4 }
          ]
        };
      }
    });
    
    app.component('PivottableUi', PivottableUi);
    app.mount('#app');
  </script>
</body>
</html>
```

## Next Steps

- Read the [README.md](./README.md) for detailed documentation
- Check [examples/](./examples/) for more examples
- See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for architecture details

