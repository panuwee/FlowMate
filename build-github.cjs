#!/usr/bin/env node
/*
 * FlowMate build step (O-1): precompile the browser JSX to plain JS so the
 * deployed page does NOT transpile with Babel-standalone on every load.
 *
 * Source of truth stays the .jsx files in github/. This compiles each one to a
 * sibling .js (classic React runtime -> uses the global `React` from the UMD
 * script, same as before). Run after editing any .jsx:
 *
 *   npm run build:github
 *
 * Then upload the generated .js files + index.html. index.html loads the .js
 * (no `type="text/babel"`, no Babel CDN).
 */
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const dir = path.join(__dirname, "github");
const FILES = ["data.jsx", "screens-a.jsx", "screens-b.jsx", "screens-c.jsx", "app.jsx"];

let ok = 0;
const changed = [];
for (const file of FILES) {
  const srcPath = path.join(dir, file);
  const outPath = path.join(dir, file.replace(/\.jsx$/, ".js"));
  const src = fs.readFileSync(srcPath, "utf8");
  const result = babel.transformSync(src, {
    filename: file,
    babelrc: false,
    configFile: false,
    // Classic runtime -> React.createElement / React.Fragment against the
    // global React UMD. Keep modern JS (optional chaining etc.) untouched -
    // FlowMate targets current Chrome/Edge, which support it natively.
    presets: [["@babel/preset-react", { runtime: "classic" }]],
    compact: false,
    comments: false,
  });
  const banner = "/* AUTO-GENERATED from " + file + " by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */\n";
  const next = banner + result.code + "\n";
  // Only write when the output actually changed, so the file's modified date
  // (and what you need to re-upload) reflects real content changes.
  const prev = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : null;
  if (prev === next) {
    console.log("unchanged", path.basename(outPath));
  } else {
    fs.writeFileSync(outPath, next, "utf8");
    console.log("UPDATED  ", path.basename(outPath), "  <- re-upload this");
    changed.push(path.basename(outPath));
    ok++;
  }
}
if (changed.length === 0) {
  console.log("\nNo output changed.");
} else {
  console.log("\nUpdated " + changed.length + " file(s) to re-upload: " + changed.join(", "));
}

