import { EventEmitter } from 'events';

export function rebroadcast<TArgs extends any[]>(evt: string, emitter: EventEmitter, rebroadcaster: EventEmitter) {
  emitter.on(evt, function broadcast(...d: TArgs) { rebroadcaster.emit(evt, ...d); });
}
