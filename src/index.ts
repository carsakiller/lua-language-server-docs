import { execSync } from "child_process";
import fs from "fs";
import axios from "axios";
import hljs from "highlight.js";
import MarkdownIt from "markdown-it";
import jsdom from "jsdom";
import chalk from "chalk";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

/********************************* CONSTANTS *********************************/

// paths
const MARKDOWN_DIR = "./wiki_pages/";
const TEMPLATE = "./src/template.html";
const HTML_DIR = "./out/";
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

/********************************** HELPERS **********************************/

function fatalError(err: NodeJS.ErrnoException | Error | null | unknown) {
  if (!err) return;

  if (err instanceof Error) {
    console.error(
      `${chalk.bgRed(" FAIL ")} ${chalk.red(err.name)} ${chalk.red(
        err.message
      )}\n${chalk.red(err.stack)}`
    );
  } else {
    console.error(err);
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
            `${chalk.bgCyanBright(" IMG↓ ")} downloaded ${chalk.blueBright(
              url
            )} and saved to ${chalk.magenta(path)}`
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
      .catch((e) => fatalError(e));
  });
}

/**
 * Converts links to other wiki pages to links pointing to local files. Also downloads images and points those to the local copies.
 */
function localizeMarkdown(txt: string) {
  // replace wiki links with links to local files
  txt = txt.replace(WIKI_LINK_REGEX, "./$1.html$2");

  // download images and point links to local files
  const replacements = [];
  for (const match of txt.matchAll(IMAGE_REGEX)) {
    const URL = match[1];
    const splitURL = match[1].split("/");
    const filename = splitURL[splitURL.length - 1].replace(/\?.*/g, "");

    if (!fs.existsSync(HTML_DIR + IMAGE_DIR + filename)) {
      downloadImage(URL, HTML_DIR + IMAGE_DIR + filename);
    }

    replacements.push({
      target: match[0],
      replacement: `![](${IMAGE_DIR + filename})`,
    });
  }
  for (const r of replacements) {
    txt = txt.replace(r.target, r.replacement);
  }

  return txt;
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
      if (e instanceof Error) {
        console.warn(`${chalk.bgYellowBright(" WARN ")} ${e.message}`);
      } else {
        console.warn(`${chalk.bgYellowBright(" WARN ")} ${e}`);
      }
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
    console.log(
      `${chalk.bgMagenta(" PULL ")} pulling ${chalk.blueBright(WIKI_REPO_URL)}`
    );
    execSync(`git --git-dir ${WIKI_REPO_GIT_DIR} --work-tree ${MARKDOWN_DIR} fetch`);
    execSync(`git --git-dir ${WIKI_REPO_GIT_DIR} --work-tree ${MARKDOWN_DIR} pull`);
  } else {
    // repo needs to be cloned
    console.log(
      `${chalk.bgMagenta(" CLNE ")} cloning into ${chalk.blueBright(
        WIKI_REPO_URL
      )}`
    );
    execSync(`git clone ${WIKI_REPO_URL} ${MARKDOWN_DIR}`);
  }

  // Get current commit hash
  commitHash = execSync(`git --git-dir ${WIKI_REPO_GIT_DIR} log --oneline`)
    .toString()
    .substring(0, 7);
} catch (e) {
  fatalError(e);
}

/************************** CONVERT MARKDOWN → HTML **************************/

fs.copyFileSync("./src/styles.css", HTML_DIR + "styles.css");

// Create dir for HTML and images
fs.mkdirSync(HTML_DIR + IMAGE_DIR, { recursive: true });

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
const nav = templateDOM.window.document.querySelector("#pages > nav");
if (!nav) throw new Error("Template does not contain #pages inside <header>");

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

  console.log(`${chalk.white.bgCyan(" READ ")} ${chalk.magentaBright(file)}`);

  // Localize images and links between pages
  content = localizeMarkdown(content);
  // Get HTML from Markdown
  const htmlString = md.render(content);
  // Convert into DOM Object
  const dom = new JSDOM(htmlString);

  // generate table of contents
  const sidenav = templateDOM.window.document.querySelector(
    "#table-of-contents > nav"
  );
  if (!sidenav)
    throw new Error(
      "Template does not contain a #table-of-contents inside an <aside>"
    );
  sidenav.innerHTML = "";

  const headings = dom.window.document.querySelectorAll("h1,h2,h3,h4,h5,h6");
  for (const heading of headings) {
    const headingText = heading.textContent ?? "LOST";
    const escapedHeading = encodeURIComponent(
      headingText.replace(/[^-\w\d\p{L}\p{M}*]+/gu, "")
    )
      .replace(/\s/g, "-")
      .toLowerCase();

    heading.id = escapedHeading;
    const tag = heading.tagName.toLowerCase();

    heading.replaceWith(
      new JSDOM(
        `<div class="heading" id="${escapedHeading}"><a href=#${escapedHeading}>#</a><${tag}>${headingText}</${tag}></div>`
      ).window.document.body
    );

    sidenav.innerHTML += `<a href="#${escapedHeading}" class="${tag}" title="${headingText}">${heading.textContent}</a>`;
  }

  const generate_stamp =
    templateDOM.window.document.querySelector("body footer > div");
  if (!generate_stamp)
    throw new Error("Template does not contain a <footer> element!");
  generate_stamp.innerHTML = `<div><i>Generated from commit <code>${commitHash}</code> of <a href="${WIKI_LINK}/${file.substring(
    0,
    file.length - 3
  )}" target="_blank">GitHub Wiki</a> at ${TIMESTAMP}</i></div>`;

  // Insert HTML into template
  const main = templateDOM.window.document.querySelector("body main");
  if (!main) throw new Error("Template does not contain a <main> element!");
  main.innerHTML = dom.serialize();

  const title = templateDOM.window.document.querySelector("head > title");
  if (!title) throw new Error("Template does not contain a <title> element!");
  title.textContent = "Sumneko-Lua / " + filename;

  try {
    fs.writeFileSync(HTML_DIR + filename + ".html", templateDOM.serialize());
    console.log(
      `${chalk.bgGreenBright(" DONE ")} ${chalk.magentaBright(
        filename + ".html"
      )}`
    );
  } catch (e) {
    fatalError(e);
  }
}
