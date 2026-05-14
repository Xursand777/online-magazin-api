---
name: Uzbek Market Excellence
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#3c4a42'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#6c7a71'
  outline-variant: '#bbcabf'
  surface-tint: '#006c49'
  primary: '#006c49'
  on-primary: '#ffffff'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#4edea3'
  secondary: '#855300'
  on-secondary: '#ffffff'
  secondary-container: '#fea619'
  on-secondary-container: '#684000'
  tertiary: '#a43a3a'
  on-tertiary: '#ffffff'
  tertiary-container: '#fc7c78'
  on-tertiary-container: '#711419'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3af'
  on-tertiary-fixed: '#410005'
  on-tertiary-fixed-variant: '#842225'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  h1:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.4'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.05em
  price:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '700'
    lineHeight: '1.0'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  container-max: 1280px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

This design system is engineered for a high-trust, professional online marketplace tailored specifically for the Uzbek market. The brand personality is **reliable, efficient, and transparent**, balancing modern global e-commerce standards with local accessibility. 

The design style follows a **Modern Corporate** aesthetic with a focus on **Minimalism**. It prioritizes clarity through heavy use of white space to reduce cognitive load during complex purchasing decisions. Every element is designed to evoke a sense of security—essential for high-value transactions and logistics-heavy operations. The interface is "production-ready," meaning it avoids experimental trends in favor of high-fidelity, functional patterns that work across varying device qualities, from budget smartphones in Tashkent to high-end desktops.

## Colors

The palette is anchored by a **Pure White (#ffffff)** background to ensure maximum legibility and a clean canvas. **Dark Slate (#1e293b)** serves as the primary text color, providing excellent contrast and a sophisticated alternative to pure black.

**Emerald Green (#10b981)** is the primary accent, used for transactional success, growth, and trust-building elements (like "Verified Seller" badges). **Orange/Amber (#f59e0b)** is reserved strictly for high-urgency CTAs, discount tags, and notifications to draw the eye immediately. Neutral surfaces use a light grey-blue scale to maintain the slate-themed harmony without feeling cold.

## Typography

The design system utilizes **Inter** for its exceptional legibility on small screens and its neutral, professional character. The typographic scale is optimized for bilingual content (Uzbek/Russian), ensuring that longer Cyrillic or Latin strings do not break layouts.

- **Headlines:** Bold and tight for clear information hierarchy.
- **Body Text:** Generous line-heights to improve readability during long browsing sessions.
- **Prices:** Rendered with a distinctive weight to make financial information stand out instantly.

## Layout & Spacing

This design system employs a **Fluid Grid** approach within a fixed-width container for desktop. It uses an 8px spatial system to ensure mathematical consistency across all components.

- **Mobile First:** Content is stacked in a single column with 16px side margins.
- **Desktop:** Transitions to a 12-column grid with 24px gutters once the viewport exceeds 1024px.
- **Sectioning:** Vertical spacing between sections (e.g., Featured Products vs. Categories) should be 48px to 64px to maintain the clean, minimalist aesthetic.

## Elevation & Depth

Visual hierarchy is managed through **Tonal Layers** and **Ambient Shadows**. Instead of heavy borders, depth is created by elevating interactive elements slightly off the pure white background.

- **Low Elevation:** Use a 1px border (#e2e8f0) for static containers like input fields.
- **Medium Elevation:** Use a subtle, diffused shadow (0px 4px 12px rgba(30, 41, 59, 0.05)) for product cards and dropdowns to suggest interactability.
- **High Elevation:** Used for modals and "Add to Cart" sticky bars on mobile, using a more pronounced shadow to indicate they sit atop the primary interface.

## Shapes

The design system uses a **Rounded** (Level 2) shape language to soften the corporate tone and make the interface feel more approachable. 

- **Standard Buttons & Inputs:** 0.5rem (8px).
- **Product Cards & Large Containers:** 1rem (16px) using `rounded-lg`.
- **Badges & Tags:** 1.5rem (24px) using `rounded-xl` for a distinct "pill" look that contrasts against rectangular product imagery.

## Components

### Buttons
- **Primary:** Emerald Green background with white text. High-trust actions.
- **Action (CTA):** Orange/Amber background with white text. Reserved for "Buy Now" or "Checkout."
- **Outline:** 1px Slate border for secondary actions like "View Details."

### Input Fields
Clean, 1px border (#e2e8f0) with `rounded-md`. The label should always be visible above the field to assist users with varying levels of digital literacy.

### Product Cards
White background with a subtle shadow and 1px border. The image area should have a slightly off-white background (#f8fafc) to frame products clearly, regardless of their own background color.

### Chips & Badges
Small, pill-shaped elements used for categories or discount percentages. Discount badges must use the Orange/Amber color to stand out against white/green elements.

### Specialized Marketplace Components
- **Trust Badges:** Small icons indicating "Safe Delivery," "Official Warranty," or "Uzcard/Humo Accepted."
- **Price Blocks:** Bolded primary text with a secondary, smaller "old price" in strikethrough for discounts.
- **Seller Profile Mini-Card:** Compact component showing seller rating and verification status to build trust within the marketplace.