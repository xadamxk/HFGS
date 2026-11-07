const { merge } = require("webpack-merge");

import { DefinePlugin } from "webpack";
import baseConfig from "./webpack.common";

const config = merge(baseConfig, {
  watch: true,
  mode: "development",
  devtool: "inline-source-map",
  // Turns on debug logging (see isDevelopment in core/Logger)
  plugins: [new DefinePlugin({ __HFGS_DEV__: JSON.stringify(true) })],
});

export default config;
