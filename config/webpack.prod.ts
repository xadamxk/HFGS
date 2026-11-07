const { merge } = require("webpack-merge");

import { DefinePlugin } from "webpack";
import baseConfig from "./webpack.common";

const config = merge(baseConfig, {
  mode: "production",
  devtool: false,
  plugins: [new DefinePlugin({ __HFGS_DEV__: JSON.stringify(false) })],
});

export default config;
