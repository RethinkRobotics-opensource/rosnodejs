/*
 *    Copyright 2016 Rethink Robotics
 *
 *    Copyright 2016 Chris Smith
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */
/// <reference path="../../types.d.ts"/>
import { EventEmitter } from 'events'
import * as Ultron from 'ultron'
import { rebroadcast } from '../utils/event_utils.js'
import type SubscriberImpl from './impl/SubscriberImpl';
import { Message } from '../types/Message';

//-----------------------------------------------------------------------

/**
 * @class Subscriber
 * Public facing subscriber class. Allows users to listen to messages from
 * publishers on a given topic.
 */
export default class Subscriber<M extends Message> extends EventEmitter {
  private _impl: SubscriberImpl<M>;
  private _topic: string;
  private _type: string;
  private _ultron: Ultron.Ultron;

  constructor(impl: SubscriberImpl<M>) {
    super();

    ++impl.count;
    this._impl = impl;
    this._ultron = new Ultron.Ultron(impl);

    this._topic = impl.getTopic();
    this._type = impl.getType();

    rebroadcast('registered', this._ultron, this);
    rebroadcast('connection', this._ultron, this);
    rebroadcast('disconnect', this._ultron, this);
    rebroadcast('error', this._ultron, this);
    rebroadcast('message', this._ultron, this);
  }

  getTopic(): string {
    return this._topic;
  }

  getType(): string {
    return this._type;
  }

  getNumPublishers(): number {
    if (this._impl) {
      return this._impl.getNumPublishers();
    }
    // else
    return 0;
  }

  async shutdown(): Promise<void> {
    if (this._impl) {
      const impl = this._impl
      this._impl = null;
      this._ultron.destroy();
      this._ultron = null;

      --impl.count;
      if (impl.count <= 0) {
        await impl.getNode().unsubscribe(impl.getTopic());
      }

      this.removeAllListeners();
    }
    // else
    return Promise.resolve();
  }

  isShutdown(): boolean {
    return !!this._impl;
  }
}

//-----------------------------------------------------------------------
