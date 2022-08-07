import fs from "fs";
import axios from "axios";
import hljs from "highlight.js";
import MarkdownIt from "markdown-it";
import jsdom from "jsdom";
import chalk from "chalk";

const MARKDOWN_DIR = "./src/markdown/";
const TEMPLATE = "./src/template.html";
const HTML_DIR = "./out/";
const IMAGE_DIR = "images/";

const WIKI_LINK_REGEX =
  /https:\/\/github\.com\/sumneko\/lua-language-server\/wiki\/([A-Za-z-]+)(#[a-z-]+)?/g;
const IMAGE_REGEX = /!\[[^\]]*\]\(([a-zA-Z:/\-.0-9?=+&%~]+)\)/g;

/**
 * Log fatal error and exit
 */
function handleError(err: NodeJS.ErrnoException | Error | null | unknown) {
  if (!err) return;

  if (err instanceof Error) {
    console.error(
      `${chalk.bgRed(" FAIL ")} ${chalk.red(err.name)} ${chalk.red(
        err.message
      )}\n${chalk.red(err.stack)}`
    );
  } else {
    console.error(err.toString());
  }
  process.exit(1);
}

async function downloadImage(url: string, path: string) {
  const writer = fs.createWriteStream(path);

  return new Promise<boolean>((resolve, reject) => {
    axios({
      method: "GET",
      url,
      responseType: "stream",
    })
      .then((response) => {
        const w = response.data.pipe(writer);
        w.on("finish", () => {
          console.log(
            `${chalk.bgCyanBright(" IMG↓ ")} downloaded ${url} and saved to ${path}`
          );
          resolve(true);
        });
        w.on("error", () => {
          console.log(
            `${chalk.bgRed(" FAIL ")} error while writing to ${chalk.magenta(
              path
            )}`
          );
          reject(false);
        });
      })
      .catch((e) => handleError(e));
  });
}

/////// Prepare Parsers ///////

// Create MarkdownIt parser
const md = new MarkdownIt({
  html: true,
  xhtmlOut: true,
  highlight: (code, lang) => {
    if (!lang) return code;
    console.log(
      `${chalk.bgYellow(" HLJS ")} highlighting ${chalk.magenta(lang)}`
    );
    return hljs.highlight(code, { language: lang }).value;
  },
});

// Create jsDOM parser
const { JSDOM } = jsdom;

const template = fs.readFileSync(TEMPLATE);
const templateDOM = new JSDOM(template);

///////////////////////////////

// Create dir for HTML and images
fs.mkdirSync(HTML_DIR + IMAGE_DIR, { recursive: true });

let markdownFiles: string[] = [];

try {
  markdownFiles = fs.readdirSync(MARKDOWN_DIR);
} catch (e) {
  handleError(e);
}

for (const file of markdownFiles) {
  let content = "";

  try {
    content = fs.readFileSync(MARKDOWN_DIR + file, "utf-8");
  } catch (e) {
    handleError(e);
  }

  console.log(`${chalk.white.bgCyan(" READ ")} ${chalk.magentaBright(file)}`);

  // replace wiki links with links to local files
  content = content.replace(WIKI_LINK_REGEX, "./$1.html$2");

  // download images and point links to local files
  const replacements = [];
  for (const match of content.matchAll(IMAGE_REGEX)) {
    const URL = match[1];
    const splitURL = match[1].split("/");
    const filename = splitURL[splitURL.length - 1].replace(/\?.*/g, "");

    downloadImage(URL, HTML_DIR + IMAGE_DIR + filename);

    replacements.push({
      target: match[0],
      replacement: `![](${IMAGE_DIR + filename})`,
    });
  }
  for (const r of replacements) {
    content = content.replace(r.target, r.replacement);
  }

  // Get HTML from Markdown
  const htmlString = md.render(content);
  // Convert into DOM Object
  const dom = new JSDOM(htmlString);

  // Insert HTML into template
  const main = templateDOM.window.document.querySelector("body > main");
  if (!main) throw new Error("Template does not contain a <main> element!");
  main.innerHTML = dom.serialize();

  const filename = file.replace(".md", ".html");

  try {
    fs.writeFileSync(
      HTML_DIR + filename,
      templateDOM.window.document.documentElement.outerHTML
    );
    console.log(
      `${chalk.bgGreenBright(" DONE ")} ${chalk.magentaBright(filename)}`
    );
  } catch (e) {
    handleError(e);
  }
}
