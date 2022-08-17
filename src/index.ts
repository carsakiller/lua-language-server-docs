import { execSync } from "child_process";
import fs from "fs";
import hljs from "highlight.js";
import MarkdownIt from "markdown-it";
import jsdom from "jsdom";
import chalk from "chalk";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import sass from "sass";
import { localizeMarkdown } from "./localize.js";
import { Outputter } from "./output.js";

dayjs.extend(utc);

/********************************* ARGUMENTS *********************************/

const args = process.argv.slice(2);
const shouldZip = args.includes("--zip");

/********************************* CONSTANTS *********************************/

// paths
const MARKDOWN_DIR = "./wiki_pages/";
const TEMPLATE = "./src/template.html";
const SASS_DIR = "./src/sass";
const HTML_DIR = "./html/";
const IMAGE_DIR = "images/";
const WIKI_REPO_GIT_DIR = MARKDOWN_DIR + ".git";

// REGEXs
const WIKI_LINK_REGEX =
  /https:\/\/github\.com\/sumneko\/lua-language-server\/wiki\/([A-Za-z-%0-9]+)(#[a-z-%0-9]+)?/g;
const IMAGE_REGEX = /!\[[^\]]*\]\(([a-zA-Z:/\-.0-9?=+&%~]+)\)/g;

// repo URLs
const WIKI_LINK = "https://github.com/sumneko/lua-language-server/wiki";
const WIKI_REPO_URL = "https://github.com/sumneko/lua-language-server.wiki.git";

// misc
const TIMESTAMP = dayjs.utc().format("DD MMM YYYY @ h:mm:a UTC");

/************************ PREPARE ZIP FILE (OPTIONAL) ************************/

const outputter = new Outputter(HTML_DIR, shouldZip);

/********************************** HELPERS **********************************/

function fatalError(err: NodeJS.ErrnoException | Error | null | unknown) {
  if (!err) return;

  if (err instanceof Error) {
    console.error(
      `🍷 → 🥴 ${chalk.red(err.name)} ${chalk.red(err.message)}\n${chalk.red(
        err.stack
      )}`
    );
  } else {
    console.error(err);
  }
  process.exit(1);
}

/****************************** PREPARE PARSERS ******************************/

// Create MarkdownIt parser
const md = new MarkdownIt({
  html: true,
  xhtmlOut: true,
  highlight: (code, lang) => {
    if (!lang) return code;
    try {
      const hl = hljs.highlight(code, { language: lang });
      return hl.value;
    } catch (e: unknown) {
      fatalError(e);
      return code;
    }
  },
});

// Create jsDOM parser
const { JSDOM } = jsdom;

// Get template file to insert markdown into
const template = fs.readFileSync(TEMPLATE);
const templateDOM = new JSDOM(template);

/***************************** GET GIT REPOSITORY *****************************/
let commitHash;

try {
  if (!fs.existsSync(MARKDOWN_DIR)) {
    fs.mkdirSync(MARKDOWN_DIR);
  }

  if (fs.existsSync(WIKI_REPO_GIT_DIR)) {
    // repo already exists locally
    console.log(`☁️  → 💽 pulling ${chalk.blueBright(WIKI_REPO_URL)}`);
    execSync(
      `git --git-dir ${WIKI_REPO_GIT_DIR} --work-tree ${MARKDOWN_DIR} fetch`
    );
    execSync(
      `git --git-dir ${WIKI_REPO_GIT_DIR} --work-tree ${MARKDOWN_DIR} pull`
    );
  } else {
    // repo needs to be cloned
    console.log(`☁ → 📄 cloning into ${chalk.blueBright(WIKI_REPO_URL)}`);
    execSync(`git clone ${WIKI_REPO_URL} ${MARKDOWN_DIR}`);
  }

  // Get current commit hash
  commitHash = execSync(`git --git-dir ${WIKI_REPO_GIT_DIR} log --oneline`)
    .toString()
    .substring(0, 7);
} catch (e) {
  fatalError(e);
}

/******************************** COMPILE SASS ********************************/

const files = fs
  .readdirSync(SASS_DIR)
  .filter((filename) => !filename.includes("_"));

for (const file of files) {
  const filename = file.substring(0, file.length - 5);
  const result = sass.compile(`./src/sass/${file}`);

  outputter.outputHTML(filename + ".css", result.css);
}

/************************** CONVERT MARKDOWN  →  HTML **************************/

let markdownFiles: string[] = [];

try {
  markdownFiles = fs.readdirSync(MARKDOWN_DIR);
  markdownFiles = markdownFiles
    .filter((filename) => filename.includes(".md", filename.length - 4))
    .filter((filename) => !filename.includes("_"));
  markdownFiles.sort((a, b) => {
    if (a === "Home.md" || b === "Home.md") {
      return a === "Home" ? 1 : -1;
    }
    return a.localeCompare(b);
  });
} catch (e) {
  fatalError(e);
}

// generate pages side navbar
const nav = templateDOM.window.document.querySelector("#pages nav");
if (!nav) throw new Error("Template does not contain #pages");

for (const file of markdownFiles) {
  const filename = file.substring(0, file.length - 3);
  nav.innerHTML += `\n<a href="./${filename}.html" title="${filename}">${filename}</a>`;
}

for (const file of markdownFiles) {
  let content = "";
  const filename = file.substring(0, file.length - 3);

  try {
    content = fs.readFileSync(MARKDOWN_DIR + file, "utf-8");
  } catch (e) {
    fatalError(e);
  }

  console.log(`👓 → 📄 ${chalk.magentaBright(file)}`);

  // Localize images and links between pages
  content = await localizeMarkdown(
    content,
    outputter,
    WIKI_LINK_REGEX,
    IMAGE_REGEX,
    IMAGE_DIR
  );
  // Get HTML from Markdown
  const htmlString = md.render(content);
  // Convert into DOM Object
  const dom = new JSDOM(htmlString);

  // generate table of contents
  const sidenav = templateDOM.window.document.querySelector(
    "#table-of-contents nav"
  );
  if (!sidenav)
    throw new Error("Template does not contain a #table-of-contents");
  sidenav.innerHTML = "";

  const previousHeadings: string[] = [];
  const headings = dom.window.document.querySelectorAll("h1,h2,h3,h4,h5,h6");
  for (const heading of headings) {
    const headingText = heading.textContent ?? "LOST";
    let escapedHeading = encodeURIComponent(
      headingText.replace(/[^-\s\w\d\p{L}\p{M}*]+/gu, "").replace(/\s/g, "-")
    ).toLowerCase();

    const matches = previousHeadings.filter((heading) =>
      heading.includes(escapedHeading)
    );

    if (matches.length > 0) {
      escapedHeading += "-" + matches.length;
    }

    previousHeadings.push(escapedHeading);

    const tag = heading.tagName.toLowerCase();
    heading.id = escapedHeading;

    heading.replaceWith(
      new JSDOM(
        `<div class="heading"><a href=#${escapedHeading} title="#${escapedHeading}">🔗</a>${heading.outerHTML}</div>`
      ).window.document.body
    );

    sidenav.innerHTML += `<a href="#${escapedHeading}" class="${tag}" title="${headingText}">${heading.textContent}</a>`;
  }

  const generate_stamp = templateDOM.window.document.querySelector("footer");
  if (!generate_stamp) throw new Error("Template does not contain a <footer>!");
  generate_stamp.innerHTML = `<div><i>Generated from commit <code>${commitHash}</code> of <a href="${WIKI_LINK}/${file.substring(
    0,
    file.length - 3
  )}" target="_blank">GitHub Wiki</a> at ${TIMESTAMP}</i></div>`;

  const selected = nav.querySelector(".active");
  if (selected) {
    selected.classList.remove("active");
  }
  const thisPageLink = nav.querySelector(`a[href='./${filename}.html']`);
  if (thisPageLink) {
    thisPageLink.classList.add("active");
  } else {
    fatalError(
      new Error(
        "Could not find link in navbar corresponding to page " + filename
      )
    );
  }

  // Insert HTML into template
  const main = templateDOM.window.document.querySelector("body main");
  if (!main) throw new Error("Template does not contain a <main> element!");
  main.innerHTML = dom.serialize();

  const title = templateDOM.window.document.querySelector("head > title");
  if (!title) throw new Error("Template does not contain a <title> element!");
  title.textContent = "Sumneko-Lua — " + filename;

  outputter.outputHTML(filename + ".html", templateDOM.serialize());
}

outputter.finalize();
