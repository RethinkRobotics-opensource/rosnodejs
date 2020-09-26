import type { EventEmitter } from 'events';
import type { Ultron } from 'ultron';

export function rebroadcast<TArgs extends any[]>(evt: string, emitter: Ultron|EventEmitter, rebroadcaster: EventEmitter) {
  emitter.on(evt, function broadcast(...d: TArgs) { rebroadcaster.emit(evt, ...d); });
}
