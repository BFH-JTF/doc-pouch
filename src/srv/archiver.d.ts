declare module "archiver" {
  import { Transform } from "stream";

  interface ZipArchiveOptions {
    zlib?: { level: number };
  }

  export class ZipArchive extends Transform {
    constructor(options?: ZipArchiveOptions);
    append(data: string | Buffer, options: { name: string }): void;
    pointer(): number;
    finalize(): Promise<void>;
  }
}
