export type RosTime = {
  secs: number;
  nsecs: number;
}

export type GetLoggers = {
  Req: {}
  Resp: { loggers: { name: string, level: string }[] }
}

export type SetLoggerLevel = {
  Req: { logger: string, level: string},
  Resp: {}
}
