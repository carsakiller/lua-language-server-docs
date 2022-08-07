"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const axios_1 = __importDefault(require("axios"));
const highlight_js_1 = __importDefault(require("highlight.js"));
const markdown_it_1 = __importDefault(require("markdown-it"));
const jsdom_1 = __importDefault(require("jsdom"));
const chalk_1 = __importDefault(require("chalk"));
const MARKDOWN_DIR = "./src/markdown/";
const TEMPLATE = "./src/template.html";
const HTML_DIR = "./out/";
const IMAGE_DIR = "images/";
const WIKI_LINK_REGEX = /https:\/\/github\.com\/sumneko\/lua-language-server\/wiki\/([A-Za-z-]+)(#[a-z-]+)?/g;
const IMAGE_REGEX = /!\[[^\]]*\]\(([a-zA-Z:/\-.0-9?=+&%~]+)\)/g;
/**
 * Log fatal error and exit
 */
function handleError(err) {
    if (!err)
        return;
    if (err instanceof Error) {
        console.error(`${chalk_1.default.bgRed(" FAIL ")} ${chalk_1.default.red(err.name)} ${chalk_1.default.red(err.message)}\n${chalk_1.default.red(err.stack)}`);
    }
    else {
        console.error(err.toString());
    }
    process.exit(1);
}
async function downloadImage(url, path) {
    const writer = fs_1.default.createWriteStream(path);
    return new Promise((resolve, reject) => {
        (0, axios_1.default)({
            method: "GET",
            url,
            responseType: "stream",
        })
            .then((response) => {
            const w = response.data.pipe(writer);
            w.on("finish", () => {
                console.log(`${chalk_1.default.bgCyanBright(" IMG↓ ")} downloaded ${url} and saved to ${path}`);
                resolve(true);
            });
            w.on("error", () => {
                console.log(`${chalk_1.default.bgRed(" FAIL ")} error while writing to ${chalk_1.default.magenta(path)}`);
                reject(false);
            });
        })
            .catch((e) => handleError(e));
    });
}
/////// Prepare Parsers ///////
// Create MarkdownIt parser
const md = new markdown_it_1.default({
    html: true,
    xhtmlOut: true,
    highlight: (code, lang) => {
        if (!lang)
            return code;
        console.log(`${chalk_1.default.bgYellow(" HLJS ")} highlighting ${chalk_1.default.magenta(lang)}`);
        return highlight_js_1.default.highlight(code, { language: lang }).value;
    },
});
// Create jsDOM parser
const { JSDOM } = jsdom_1.default;
const template = fs_1.default.readFileSync(TEMPLATE);
const templateDOM = new JSDOM(template);
///////////////////////////////
// Create dir for HTML and images
fs_1.default.mkdirSync(HTML_DIR + IMAGE_DIR, { recursive: true });
let markdownFiles = [];
try {
    markdownFiles = fs_1.default.readdirSync(MARKDOWN_DIR);
}
catch (e) {
    handleError(e);
}
for (const file of markdownFiles) {
    let content = "";
    try {
        content = fs_1.default.readFileSync(MARKDOWN_DIR + file, "utf-8");
    }
    catch (e) {
        handleError(e);
    }
    console.log(`${chalk_1.default.white.bgCyan(" READ ")} ${chalk_1.default.magentaBright(file)}`);
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
    if (!main)
        throw new Error("Template does not contain a <main> element!");
    main.innerHTML = dom.serialize();
    const filename = file.replace(".md", ".html");
    try {
        fs_1.default.writeFileSync(HTML_DIR + filename, templateDOM.window.document.documentElement.outerHTML);
        console.log(`${chalk_1.default.bgGreenBright(" DONE ")} ${chalk_1.default.magentaBright(filename)}`);
    }
    catch (e) {
        handleError(e);
    }
}
