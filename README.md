# Purpose
This tool is meant to clone the [sumneko/lua-language-server wiki's repo](https://github.com/sumneko/lua-language-server/wiki) and output the documentation as HTML files, instead of Markdown. It is possible that this could be used for other repositories by switching out the links defined near the top of [`index.ts`](https://github.com/carsakiller/lua-language-server-docs/blob/main/src/index.ts), but I don't really support it. This tool is just a quick script to do a relatively simple job.

# Usage
You will need `nodejs` and `git`.

1. Clone the repo
2. `npm i` to install dependencies
3. `tsc` to compile TS into JS
4. `npm run generate ` to generate HTML files

You should now have a `out/` directory with all of the HTML files as well as a sub-directory `images/` with all of the images from the wiki.
