import axios from "axios";
import chalk from "chalk";
import { Outputter } from "./output";
import fs from "fs";

/* Downloads an image from the internet and returns the base64 data as a string */
async function downloadImage(url: string): Promise<string> {
  return axios
    .get(url, { responseType: "arraybuffer" })
    .then((response) =>
      Buffer.from(response.data, "binary").toString("base64")
    );
}

/* Redirect page to page links to local files. Also downloads images and points those to the local copies. */
export async function localizeMarkdown(
  txt: string,
  outputter: Outputter,
  wikiLinkRegex: RegExp,
  imageRegex: RegExp,
  imageDir: string
): Promise<string> {
  // replace wiki links with links to local files
  txt = txt.replace(wikiLinkRegex, "./$1.html$2");

  // download images and point links to local files
  const replacements = [];
  const imagePromises = [];

  for (const match of txt.matchAll(imageRegex)) {
    const URL = match[1];
    const splitURL = match[1].split("/");
    const filename = splitURL[splitURL.length - 1].replace(/\?\w+=.*/g, "");

    if (
      outputter.getMethod() === "zip" ||
      !fs.existsSync(`${outputter.outDir}${imageDir}${filename}`)
    ) {
      imagePromises.push(
        new Promise<void>((resolve) => {
          downloadImage(URL).then((image) => {
            console.log(`☁️  → 🎨 ${chalk.blueBright(filename)}`);
            outputter.outputImage(filename, image);
            resolve();
          });
        })
      );
    }

    replacements.push({
      target: match[0],
      replacement: `![](${imageDir + filename})`,
    });
  }

  for (const r of replacements) {
    txt = txt.replace(r.target, r.replacement);
  }

  await Promise.allSettled(imagePromises);

  return txt;
}
