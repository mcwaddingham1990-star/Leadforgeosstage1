# Owners Local OS Development Standards

## Data-entry workflows

Every new or redesigned workflow that creates or updates business data must provide both:

1. **Manual entry** as a complete, first-class input method.
2. **AI Snapshot/autopopulate** when information can reasonably be read from a photograph, upload, completed paper form, or preset phone/tablet form.

AI-extracted information must appear in editable fields for human review before saving. AI must never silently create final records, invent missing values, or remove the owner’s ability to correct the destination and contents.

Financial intake must use the shared taxonomy:

- **Bills:** service-provider obligations linked to one Service Provider record.
- **Material Expenses:** materials, equipment, fuel, tools, supplies, inventory purchases, and operational/job costs.
- **Payroll:** wages, salaries, and payroll-related records.
- **Other Expenses:** expenses that genuinely do not fit the categories above.

These remain separate sources of truth and may roll up into **Total Expenses** only for reporting, graphs, profit calculations, and analysis.

## Pull-request check

A data-entry change is incomplete until reviewers can answer yes to all four questions:

- Is full manual entry available?
- Is AI Snapshot/autopopulate available when applicable?
- Is AI output editable and reviewed before saving?
- Does the saved record go to the correct module and canonical financial category?
