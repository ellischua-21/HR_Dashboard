# Shared controls and toolbars

`public/css/Styles.css` defines the shared appearance for existing pages and
forms, including fields created by JavaScript. New ordinary inputs, selects,
textareas, and buttons inherit these rules without a page-specific style.

- `--control-height`: ordinary single-line fields and minimum button height.
- `--control-font-size`: consistent text size for fields and action buttons.
- `--control-padding` and `--control-radius`: field padding and corners.
- `--field-gap`: spacing between a label and its field.
- `--toolbar-gap`: spacing between filters and action controls.
- `--filter-width`: stable default toolbar field width, independent of options.

Use `.toolbar` for wrapping filter/action rows, `.filters` for a grid of dashboard
filters, `.fgrid` for form fields, and `.actions` for form action buttons. Existing
label selectors share one declaration block. Toolbar labels sit above their
fields, and buttons align with field bottoms. A `.form-search` field can expand
to use remaining toolbar space. `.loading-slot` reserves spinner space even when
empty so loading does not move neighboring controls.

Keep page-specific CSS for meaningful layout constraints, such as attendance day
navigation, time-record table columns, and document previews. Override shared
tokens when a component needs a different scale rather than copying field styles.
Checkboxes, radio buttons, hidden inputs, file controls, switches, and icon buttons
retain the behavior and geometry appropriate to their purpose. Multiline fields
keep their requested rows and resize vertically; they do not receive a fixed
single-line height.
