const path = require("path");
import { Configuration } from "webpack";
const CopyPlugin = require("copy-webpack-plugin");

const baseConfig: Configuration = {
  entry: {
    background: "./src/background.ts",
    content: "./src/content.ts",
    "page-bridge": "./src/page-bridge.ts",
    options: "./src/options/index.ts",
  },
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "../dist"),
    // delete old build files
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      // Compile only: type errors are caught by `npm run typecheck`, not the build
      {
        test: /\.[cm]?ts$/,
        loader: "ts-loader",
        options: { transpileOnly: true },
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "./src/manifest.json" },
        { from: "./src/options/options.html" },
        { from: "./src/options/options.css" },
        { from: "./src/assets", to: "assets" },
      ],
    }),
  ],
};

export default baseConfig;
