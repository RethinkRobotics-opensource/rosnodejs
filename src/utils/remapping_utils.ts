
export enum SPECIAL_KEYS {
  name = '__name',
  log = '__log', // I don't think rosnodejs is responsible for changing the log directory
  ip = '__ip',
  hostname = '__hostname',
  master = '__master',
  ns = '__ns'
};

export type RemapT = {
  [SPECIAL_KEYS.name]?: string;
  [SPECIAL_KEYS.log]?: string;
  [SPECIAL_KEYS.ip]?: string;
  [SPECIAL_KEYS.hostname]?: string;
  [SPECIAL_KEYS.master]?: string;
  [SPECIAL_KEYS.ns]?: string;
  [key: string]: string;
};

export function processRemapping(args: string[]): RemapT {
  const len = args.length;

  const remapping: RemapT = {};

  for (let i = 0; i < len; ++i) {
    const arg = args[i];
    let p = arg.indexOf(':=');
    if (p >= 0) {
      const local = arg.substring(0, p);
      const external = arg.substring(p+2);

      remapping[local] = external;
    }
  }

  return remapping;
}
