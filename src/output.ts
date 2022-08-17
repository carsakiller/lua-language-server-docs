import fs from "fs";
import JSZip from "jszip";
import chalk from "chalk";

export class Outputter {
  outDir: string;
  imageDir: string;
  zip: JSZip | undefined;

  constructor(outDir: string, imageDir: string, zip: boolean) {
    this.outDir = outDir;
    this.imageDir = imageDir;

    if (zip) {
      this.zip = new JSZip();
    } else {
      fs.mkdirSync(outDir + "images/", { recursive: true });
    }
  }

  /* Get if zipping or normal writing is being used */
  getMethod(): "zip" | "standard" {
    return this.zip ? "zip" : "standard";
  }

  outputHTML(path: string, content: string | number | boolean) {
    if (this.zip) {
      this.zip.file(path, content.toString());
    } else {
      fs.writeFileSync(this.outDir + path, content.toString());
    }
  }

  outputImage(filename: string, content: string) {
    if (this.zip) {
      this.zip.file(this.imageDir + filename, content, {
        compressionOptions: { level: 1 },
        base64: true,
      });
    } else {
      fs.writeFileSync(this.outDir + this.imageDir + filename, content, {
        encoding: "base64",
      });
    }
  }

  finalize() {
    if (this.zip) {
      this.zip
        .generateNodeStream({ type: "nodebuffer", streamFiles: true })
        .pipe(fs.createWriteStream("doc.zip"))
        .on("finish", () =>
          console.log(`🤐 → 💽 ${chalk.magentaBright("doc.zip")}`)
        );
    }
  }
}
