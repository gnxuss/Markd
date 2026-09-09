declare module "node:fs/promises" {
  export type Dirent = {
    readonly name: string;
    readonly isDirectory: () => boolean;
  };

  export function mkdtemp(prefix: string): Promise<string>;
  export function mkdir(path: string, options: { readonly recursive: true }): Promise<string | undefined>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function readdir(
    path: string,
    options: { readonly withFileTypes: true },
  ): Promise<readonly Dirent[]>;
  export function rm(
    path: string,
    options: { readonly force: boolean; readonly recursive: boolean },
  ): Promise<void>;
  export function writeFile(path: string, data: string): Promise<void>;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function extname(path: string): string;
  export function join(...paths: readonly string[]): string;
}
