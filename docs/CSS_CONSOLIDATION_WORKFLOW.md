# CSS Consolidation Workflow

## Overview

Consolidate all inline CSS from template files into a single source of truth: `/static/css/style.css`. This document defines the workflow, naming conventions, and organizational structure.

---

## Phase 1: Audit & Planning

### 1.1 Inventory Current State

**Step 1:** Identify all templates with inline `<style>` blocks
```bash
grep -l "<style>" templates/*.html
```

**Step 2:** Document inline CSS by page
```bash
# Extract inline styles from each template
grep -A 500 "<style>" templates/users.html | head -100
```

**Step 3:** Identify conflicts
- Duplicate selectors across pages
- Different values for same elements
- Unused/dead CSS

### 1.2 Define CSS Organization

The consolidated `style.css` will be organized into logical sections:

```
1. :root variables (existing)
2. Global resets & base (existing)
3. Page-specific styles (NEW - organized by page)
   ├── /* ═══ PAGE: USERS ═══ */
   ├── /* ═══ PAGE: OS ═══ */
   ├── /* ═══ PAGE: NETWORK ═══ */
   ├── /* ═══ PAGE: FIREWALL ═══ */
   └── /* ═══ PAGE: LOGS ═══ */
4. Utility classes (existing)
5. Theme overrides (existing)
```

---

## Phase 2: CSS Naming Convention

### 2.1 Page-Specific Class Names

All page-specific classes follow this pattern:

```
.[page-name]-[component]-[state]

Examples:
.users-detail-row
.users-avatar
.users-avatar-lg
.users-shell-badge
.users-row-clickable
.users-row-clickable.selected
.users-row-clickable:hover

.os-metric-card
.os-metric-value
.os-chart-container

.network-interface-item
.network-address-list
```

**Benefits:**
- ✅ Prevents naming collisions across pages
- ✅ Clear namespace scoping
- ✅ Easy to find all styles for a page
- ✅ Safe to remove page-specific styles if needed

### 2.2 Shared/Reusable Classes

Keep existing utility classes unchanged:
- `.card`, `.btn`, `.container`, etc. (Bootstrap)
- `.ll-*` prefix for custom utilities
- Color and spacing utilities

---

## Phase 3: Refactoring Template

### 3.1 Remove Inline Styles

**Before:**
```html
<style>
  .user-detail-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .user-detail-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  /* ... 50+ more styles ... */
</style>
```

**After:**
```html
<!-- All styles moved to /static/css/style.css in [PAGE: USERS] section -->
```

### 3.2 Update Class Names (if needed)

If a page-specific style isn't already namespaced, update both CSS and HTML:

```css
/* OLD: Could conflict with other pages */
.detail-row { ... }

/* NEW: Page-namespaced, collision-proof */
.users-detail-row { ... }
```

Update all references in the template:
```html
<!-- OLD -->
<div class="detail-row">

<!-- NEW -->
<div class="users-detail-row">
```

### 3.3 Validate All Styles Exist in CSS File

After moving all inline styles, verify:
1. ✅ All class names have corresponding CSS rules
2. ✅ All media queries are included
3. ✅ All `:hover`, `:focus`, `:disabled` states are present
4. ✅ No duplicate selectors in CSS file

---

## Phase 4: CSS Organization Template

### 4.1 Section Header Format

```css
/*
════════════════════════════════════════════════════════════════════════════════
  PAGE: USERS
  File: templates/users.html
  Description: User/account management page
════════════════════════════════════════════════════════════════════════════════
*/
```

### 4.2 Grouped Subsections Within Page

```css
/* ── Component: Detail Row ── */
.users-detail-row { ... }
.users-detail-label { ... }
.users-detail-value { ... }
.users-detail-grid { ... }

/* ── Component: Avatar ── */
.users-avatar { ... }
.users-avatar-lg { ... }

/* ── Component: Interactive Row ── */
.users-row-clickable { ... }
.users-row-clickable.selected { ... }
.users-row-clickable:hover { ... }

/* ── Component: Modal Overrides ── */
.modal-content { ... }
.form-control { ... }
```

### 4.3 Full Example Structure

```css
/*
════════════════════════════════════════════════════════════════════════════════
  PAGE: USERS
  File: templates/users.html
  Description: User and account management, user selection, quick actions
════════════════════════════════════════════════════════════════════════════════
*/

/* ── Component: Detail Row ── */
.users-detail-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.users-detail-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.users-detail-value {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 0.82rem;
  color: var(--text-main);
  word-break: break-all;
}

.users-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

/* ── Component: Avatar ── */
.users-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent-soft);
  border: 2px solid var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  color: var(--accent);
  flex-shrink: 0;
  font-weight: 600;
}

.users-avatar-lg {
  width: 64px;
  height: 64px;
  font-size: 1.6rem;
}

/* ── Component: Interactive Row ── */
.users-row-clickable {
  cursor: pointer;
  transition: background var(--transition-speed);
}

.users-row-clickable.selected {
  background: var(--accent-soft) !important;
}

.users-row-clickable:hover {
  background: rgba(196, 181, 253, 0.06) !important;
}

/* ── Component: Shell Badge ── */
.users-shell-badge {
  font-family: monospace;
  font-size: 0.75rem;
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: var(--radius-small);
  padding: 0.15rem 0.5rem;
}

/* ── Component: Detail Panel ── */
.users-detail-empty {
  text-align: center;
  padding: 2.5rem 1rem;
  color: var(--text-muted);
  font-size: 0.88rem;
}

.users-detail-empty i {
  font-size: 2rem;
  display: block;
  margin-bottom: 0.5rem;
  opacity: 0.4;
}

.users-section-divider {
  border-top: 1px solid var(--border-color);
  margin: 1rem 0;
}

#userDetailPanel {
  min-height: 220px;
}

/* ── Component: Modal Overrides ── */
#addUserModal .modal-content,
#editUserModal .modal-content,
#changePasswordModal .modal-content,
#changeShellModal .modal-content,
#removeUserModal .modal-content {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-medium);
}

#addUserModal .modal-header,
#editUserModal .modal-header,
#changePasswordModal .modal-header,
#changeShellModal .modal-header,
#removeUserModal .modal-header {
  border-bottom: 1px solid var(--border-color);
}

#addUserModal .modal-footer,
#editUserModal .modal-footer,
#changePasswordModal .modal-footer,
#changeShellModal .modal-footer,
#removeUserModal .modal-footer {
  border-top: 1px solid var(--border-color);
}

#addUserModal .form-control,
#addUserModal .form-select,
#editUserModal .form-control,
#editUserModal .form-select,
#changePasswordModal .form-control,
#changePasswordModal .form-select,
#changeShellModal .form-control,
#changeShellModal .form-select,
#removeUserModal .form-control,
#removeUserModal .form-select {
  background: var(--bg-main);
  border-color: var(--border-color);
  color: var(--text-main);
}

#addUserModal .form-control:focus,
#addUserModal .form-select:focus,
#editUserModal .form-control:focus,
#editUserModal .form-select:focus,
#changePasswordModal .form-control:focus,
#changePasswordModal .form-select:focus,
#changeShellModal .form-control:focus,
#changeShellModal .form-select:focus,
#removeUserModal .form-control:focus,
#removeUserModal .form-select:focus {
  background: var(--bg-main);
  border-color: var(--accent);
  color: var(--text-main);
  box-shadow: 0 0 0 3px var(--color-focus-ring);
}

#addUserModal .form-label,
#editUserModal .form-label,
#changePasswordModal .form-label,
#changeShellModal .form-label,
#removeUserModal .form-label {
  color: var(--text-muted);
  font-size: 0.83rem;
}
```

---

## Phase 5: Template HTML Updates

### 5.1 Remove `<style>` Block

Delete the entire `<style>...</style>` section from the template.

### 5.2 Verify CSS Links Exist

Ensure the template still includes the CSS file in `<head>`:

```html
<head>
  <!-- ... other head content ... -->
  <link href="/static/css/style.css" rel="stylesheet">
  <!-- Remove <style> block — all styles now in CSS file -->
</head>
```

### 5.3 Update Class Names (if needed)

Update any classes in HTML to use the new page-namespaced convention:

```html
<!-- OLD -->
<div class="detail-row">

<!-- NEW -->
<div class="users-detail-row">
```

---

## Phase 6: Validation Checklist

### 6.1 Before Deployment

- [ ] All inline `<style>` blocks removed from template
- [ ] All CSS selectors exist in `/static/css/style.css`
- [ ] Page-specific classes use `[page-name]-` prefix
- [ ] No duplicate selectors in CSS file
- [ ] All media queries preserved
- [ ] All `:hover`, `:focus`, `:disabled` states present
- [ ] HTML class names match CSS selectors exactly
- [ ] CSS is organized with clear section headers
- [ ] No inline `style=""` attributes in HTML (use classes only)

### 6.2 Testing

```bash
# Load page in browser
# Check Developer Tools → Elements → Styles
# Verify:
# ✅ All styles apply correctly
# ✅ Hover states work
# ✅ Responsive layout works
# ✅ No FOUC (Flash of Unstyled Content)
# ✅ No CSS conflicts
```

---

## Phase 7: Rollout Plan

### 7.1 Recommended Order

Process templates in this order (easiest to hardest):

1. **users.html** (example refactor below)
2. **logs.html**
3. **os.html**
4. **network.html**
5. **firewall/fw_old.html**
6. **index.html** (most complex)

### 7.2 Per-Page Workflow

For each page:

1. **Extract** — Copy all `<style>` content to notepad
2. **Name** — Add page prefix to all classes that need it
3. **Consolidate** — Paste into `style.css` in `[PAGE: ...]` section
4. **Update HTML** — Remove `<style>` block, update class names
5. **Test** — Verify page displays correctly
6. **Commit** — Git commit with message: `refactor(css): consolidate [page-name] styles to style.css`

### 7.3 Commit Message Format

```
refactor(css): consolidate [page-name] inline styles to style.css

- Moved all <style> rules from templates/[page-name].html to static/css/style.css
- Added [page-name]- prefix to page-specific classes to prevent namespace collisions
- Organized styles in [PAGE: NAME] section with component grouping
- All functionality preserved, visual appearance unchanged

Closes #[issue-number] (if applicable)
```

---

## Phase 8: Maintenance Guidelines

### 8.1 Adding New Page Styles

When adding styles for a new page:

1. ✅ DO add a `[PAGE: NAME]` section header
2. ✅ DO use `[page-name]-` prefix for all new classes
3. ✅ DO group related styles under component comments
4. ✅ DO reference CSS variables (not hardcoded colors)
5. ✅ DO NOT add inline `<style>` blocks in templates
6. ✅ DO NOT use inline `style=""` attributes

### 8.2 Updating Existing Page Styles

When modifying page styles:

1. Find the `[PAGE: NAME]` section in `style.css`
2. Update the rule there (not in template)
3. Test in browser DevTools
4. Commit change to `style.css`

### 8.3 Removing Page Styles

When removing a page:

1. Delete the entire `[PAGE: NAME]` section from `style.css`
2. Verify no other templates use those classes
3. Commit removal

---

## Phase 9: Benefits & Outcomes

### 9.1 Single Source of Truth
- ✅ One file to manage all CSS
- ✅ No style duplication across files
- ✅ No conflicting definitions

### 9.2 Improved Maintainability
- ✅ Clear organization by page
- ✅ Easy to find styles: `[page-name]-[component]`
- ✅ Component grouping within pages
- ✅ Transparent relationships between HTML and CSS

### 9.3 Better Performance
- ✅ Single HTTP request for CSS (already cached)
- ✅ Smaller individual HTML files
- ✅ Easier to minify/optimize CSS pipeline

### 9.4 Scaling & Reusability
- ✅ Shared utilities in global section
- ✅ Page-specific styles isolated
- ✅ Easy to add new pages with clear pattern
- ✅ Theme overrides stay in one place

---

## Example: Refactoring users.html

See implementation example below:

### Before (inline style)
```html
<style>
  .user-detail-row { ... }
  .user-detail-label { ... }
  /* 50 more styles */
</style>
```

### After (consolidated in style.css)
```css
/*
════════════════════════════════════════════════════════════════════════════════
  PAGE: USERS
  File: templates/users.html
  Description: User/account management, user selection, quick actions
════════════════════════════════════════════════════════════════════════════════
*/

/* ── Component: Detail Row ── */
.users-detail-row { ... }
.users-detail-label { ... }
/* styles grouped by component */
```

### HTML simplified
```html
<!-- No <style> block, classes updated if needed -->
<div class="users-detail-row">
  <span class="users-detail-label">UID</span>
</div>
```

---

## Quick Reference

| Step | Action | File | Command |
|------|--------|------|---------|
| 1 | Identify inline styles | templates/*.html | `grep -l "<style>"` |
| 2 | Extract styles | style.css | Copy+paste to new section |
| 3 | Rename classes | templates/*.html | Find/replace with page prefix |
| 4 | Remove style block | templates/*.html | Delete `<style>...</style>` |
| 5 | Test | Browser | Check DevTools → Styles |
| 6 | Commit | Git | `git commit -m "refactor(css): ..."`|

---

## Questions?

This workflow ensures:
- 🎯 **Single source of truth** — all CSS in one file
- 🏗️ **Clear organization** — page sections with component grouping
- 🔒 **No namespace collisions** — page-specific class prefixes
- 📚 **Maintainable** — easy to find and update styles
- 🚀 **Scalable** — pattern works for unlimited pages

