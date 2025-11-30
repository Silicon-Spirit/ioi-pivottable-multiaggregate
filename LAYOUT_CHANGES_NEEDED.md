# Control Panel Layout Changes Required

Based on your image, you want to:

1. **Move aggregator controls inline (horizontal layout)**
   - Currently: Count/Sum dropdowns are stacked vertically
   - Desired: Display them horizontally in a row with +/- buttons inline

2. **Reduce select dropdown widths**
   - Make all select tags narrower to reduce control panel width

## Changes Needed:

### 1. CSS Changes (pivottable.css)
- Change `.pvtAggregatorList` from `flex-direction: column` to `flex-direction: row`
- Reduce `.pvtDropdown` min-width from current size to smaller (e.g., 80px-100px)
- Adjust `.pvtAggregatorOption` to display inline

### 2. JavaScript Changes (PivottableUi.js)
- Modify the aggregatorCell rendering logic (around line 1257-1400)
- Change layout from vertical stacking to horizontal flow
- Adjust inline styles for aggregator dropdowns

Would you like me to proceed with these changes?
