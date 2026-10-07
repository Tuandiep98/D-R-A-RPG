declare module 'obj2gltf' {
  interface Options {
    binary?: boolean;
    unlit?: boolean;
    separate?: boolean;
  }
  export default function obj2gltf(path: string, options?: Options): Promise<Buffer>;
}
