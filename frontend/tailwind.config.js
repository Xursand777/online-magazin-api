const color = (name) => `rgb(var(${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      "colors": {
        "primary-fixed": color("--color-primary-fixed"),
        "surface-container-lowest": color("--color-surface-container-lowest"),
        "primary-fixed-dim": color("--color-primary-fixed-dim"),
        "on-tertiary-fixed": color("--color-on-tertiary-fixed"),
        "surface-container": color("--color-surface-container"),
        "on-tertiary-fixed-variant": color("--color-on-tertiary-fixed-variant"),
        "primary": color("--color-primary"),
        "tertiary": color("--color-tertiary"),
        "surface-dim": color("--color-surface-dim"),
        "outline": color("--color-outline"),
        "on-error": color("--color-on-error"),
        "secondary-fixed": color("--color-secondary-fixed"),
        "on-primary-container": color("--color-on-primary-container"),
        "on-secondary": color("--color-on-secondary"),
        "on-background": color("--color-on-background"),
        "secondary": color("--color-secondary"),
        "on-secondary-container": color("--color-on-secondary-container"),
        "error": color("--color-error"),
        "surface-variant": color("--color-surface-variant"),
        "surface-container-low": color("--color-surface-container-low"),
        "on-primary": color("--color-on-primary"),
        "tertiary-container": color("--color-tertiary-container"),
        "on-secondary-fixed-variant": color("--color-on-secondary-fixed-variant"),
        "surface-container-high": color("--color-surface-container-high"),
        "surface-tint": color("--color-surface-tint"),
        "tertiary-fixed": color("--color-tertiary-fixed"),
        "inverse-primary": color("--color-inverse-primary"),
        "on-tertiary": color("--color-on-tertiary"),
        "surface-bright": color("--color-surface-bright"),
        "surface-container-highest": color("--color-surface-container-highest"),
        "tertiary-fixed-dim": color("--color-tertiary-fixed-dim"),
        "on-primary-fixed": color("--color-on-primary-fixed"),
        "primary-container": color("--color-primary-container"),
        "on-tertiary-container": color("--color-on-tertiary-container"),
        "error-container": color("--color-error-container"),
        "on-secondary-fixed": color("--color-on-secondary-fixed"),
        "outline-variant": color("--color-outline-variant"),
        "on-surface": color("--color-on-surface"),
        "inverse-on-surface": color("--color-inverse-on-surface"),
        "on-primary-fixed-variant": color("--color-on-primary-fixed-variant"),
        "inverse-surface": color("--color-inverse-surface"),
        "secondary-fixed-dim": color("--color-secondary-fixed-dim"),
        "on-error-container": color("--color-on-error-container"),
        "background": color("--color-background"),
        "on-surface-variant": color("--color-on-surface-variant"),
        "secondary-container": color("--color-secondary-container"),
        "surface": color("--color-surface")
      },
      "borderRadius": {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      "spacing": {
        "3xl": "64px",
        "2xl": "48px",
        "container-max": "1280px",
        "margin-mobile": "16px",
        "lg": "24px",
        "md": "16px",
        "base": "4px",
        "margin-desktop": "32px",
        "sm": "8px",
        "xl": "32px",
        "gutter": "16px",
        "xs": "4px"
      },
      "fontFamily": {
        "h2": ["Inter", "sans-serif"],
        "label-md": ["Inter", "sans-serif"],
        "body-lg": ["Inter", "sans-serif"],
        "h3": ["Inter", "sans-serif"],
        "h1": ["Inter", "sans-serif"],
        "body-md": ["Inter", "sans-serif"],
        "body-sm": ["Inter", "sans-serif"],
        "price": ["Inter", "sans-serif"],
        "sans": ["Inter", "sans-serif"]
      },
      "fontSize": {
        "h2": ["30px", { "lineHeight": "1.2", "letterSpacing": "-0.01em", "fontWeight": "700" }],
        "label-md": ["14px", { "lineHeight": "1.0", "letterSpacing": "0.05em", "fontWeight": "600" }],
        "body-lg": ["18px", { "lineHeight": "1.6", "fontWeight": "400" }],
        "h3": ["24px", { "lineHeight": "1.3", "fontWeight": "600" }],
        "h1": ["48px", { "lineHeight": "1.1", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "body-md": ["16px", { "lineHeight": "1.5", "fontWeight": "400" }],
        "body-sm": ["14px", { "lineHeight": "1.4", "fontWeight": "400" }],
        "price": ["20px", { "lineHeight": "1.0", "fontWeight": "700" }]
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
