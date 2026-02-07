# Point and Prompt - Frontend Memory

## Project Architecture
- **Single-page app**: Everything in `index.html` - HTML, CSS (in `<style>`), and JS (in `<script>`)
- **Stack**: Tailwind CSS (CDN), marked.js, DOMPurify
- **Pattern**: Click `.point-prompt-target` or `.point-prompt-action` → context menu → chat panel slides in

## Theme System Implementation

### Approach
- Uses `[data-theme="dark"]` attribute on `<html>` element
- CSS custom properties defined on `:root` (light) and `[data-theme="dark"]` (dark)
- Overrides Tailwind utility classes using specificity: `[data-theme="dark"] .bg-white { ... }`
- Smooth transitions via `transition` properties on key elements

### Dark Theme Palette (Clinical Aesthetic)
- Background: `#0f172a` (deep slate)
- Surface/cards: `#1e293b` (lighter slate)
- Surface hover: `#334155`
- Text: `#e2e8f0` (light gray body), `#f1f5f9` (white headings)
- Borders: `#334155` (subtle)
- Accent blue: `#3b82f6` (brighter for contrast)
- Accent red: `#dc2626` (preserved for branding)

### Theme Toggle
- Custom button with animated sun/moon SVG icons
- Rotate + scale animation for icon transitions
- Location: Header bar, before print/refresh buttons
- Persistence: `localStorage` key `point-and-prompt-theme`
- Respects system preference on first load

### JavaScript Pattern
- IIFE at start of `<script>` for theme initialization
- Runs before DOMContentLoaded to prevent flash
- `setTheme()`, `toggleTheme()`, `getPreferredTheme()` functions
- Listens for system theme changes when no stored preference

## Key UI Elements Covered
- Header bar
- Sidebar filters
- Main content area (white surface)
- Table (header bg, row hover)
- Context menu (Point and Prompt dialog)
- Chat panel and message bubbles
- Input fields and buttons
- Pagination controls

## Known Patterns
- Tailwind utilities remain in HTML for maintainability
- Theme overrides use `!important` to ensure specificity over Tailwind
- All interactive elements have `:hover` states that adapt to theme
- Chat assistant messages have special styling for code/pre/blockquote that respects theme

## Testing Checklist
- [ ] Toggle works in header
- [ ] Theme persists across page reloads
- [ ] All UI sections change color appropriately
- [ ] Hover states visible in both themes
- [ ] Text contrast sufficient (WCAG AA)
- [ ] Smooth transition animation
- [ ] Chat panel and context menu themed correctly
