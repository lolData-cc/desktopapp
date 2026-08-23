/** The website's tokens, so a component lifted from it lands looking right. */
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
      },
      fontFamily: {
        chakrapetch: ['"Chakra Petch"', "sans-serif"],
        jetbrains: ['"JetBrains Mono"', "monospace"],
      },
    },
  },
  plugins: [],
}
