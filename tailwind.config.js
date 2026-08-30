/** The website's tokens, so a component lifted from it lands looking right. */
import animate from "tailwindcss-animate"
export default {
  content: ["./index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        liquirice: "#040A0C",
        flash: "#D7D8D9",
        jade: "#00D992",
        citrine: "#FFB615",
        rose: "#FF6286",
        pine: "#148460",
        // The four the site defines as CSS variables and this app does not.
        // Flat here on purpose: the site carries a light theme and resolves
        // these per theme, while this app is dark-only, so the dark values are
        // the only ones it can ever need.
        error: "#FF6286",
        hairline: "#FFFFFF",
        filmlight: "#FFFFFF",
        filmdark: "#000000",
      },
      cursor: {
        clicker: 'url("/cursors/clicker.svg") 16 6, auto',
        pointer: 'url("/cursors/base.svg") 8 8, auto',
      },
      fontFamily: {
        chakrapetch: ['"Chakra Petch"', "sans-serif"],
        jetbrains: ['"JetBrains Mono"', "monospace"],
      },
    },
  },
  plugins: [animate],
}
