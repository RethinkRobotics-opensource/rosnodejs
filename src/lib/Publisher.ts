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
 *    Unless required by applicable law or agreed to in writing,
 *    software distributed under the License is distributed on an "AS
 *    IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 *    express or implied. See the License for the specific language
 *    governing permissions and limitations under the License.
 */

/// <reference path="../../types.d.ts"/>
import { EventEmitter } from 'events'
import Ultron = require('ultron');
import { rebroadcast } from '../utils/event_utils'
import type PublisherImpl from './impl/PublisherImpl';

/**
 * @class Publisher
 * Public facing publishers class. Allows users to send messages to subscribers
 * on a given topic.
 */
export default class Publisher<M> extends EventEmitter {
  _impl: PublisherImpl<M>;
  _topic: string;
  _type: string;
  _ultron: Ultron;

  constructor(impl: PublisherImpl<M>) {
    super();

    ++impl.count;
    this._impl = impl;
    this._ultron = new Ultron(impl);

    this._topic = impl.getTopic();
    this._type = impl.getType();

    rebroadcast('registered', this._ultron, this);
    rebroadcast('connection', this._ultron, this);
    rebroadcast('disconnect', this._ultron, this);
    rebroadcast('error', this._ultron, this);
  }

  /**
   * Get the topic this publisher is publishing on
   * @returns {string}
   */
  getTopic(): string {
    return this._topic;
  }

  /**
   * Get the type of message this publisher is sending
   *            (e.g. std_msgs/String)
   * @returns {string}
   */
  getType(): string {
    return this._type;
  }

  /**
   * Check if this publisher is latching
   * @returns {boolean}
   */
  getLatching(): boolean {
    if (this._impl) {
      return this._impl.getLatching();
    }
    // else
    return false;
  }

  /**
   * Get the numbber of subscribers currently connected to this publisher
   * @returns {number}
   */
  getNumSubscribers(): number {
    if (this._impl) {
      return this._impl.getNumSubscribers();
    }
    // else
    return 0;
  }

  /**
   * Shuts down this publisher. If this is the last publisher on this topic
   * for this node, closes the publisher and unregisters the topic from Master
   * @returns {Promise}
   */
  async shutdown(): Promise<void> {
    const topic= this.getTopic();
    if (this._impl) {
      const impl = this._impl
      this._impl = null;
      this._ultron.destroy();
      this._ultron = null;

      --impl.count;
      if (impl.count <= 0) {
        await impl.getNode().unadvertise(impl.getTopic());
      }

      this.removeAllListeners();
    }
  }

  /**
   * Check if this publisher has been shutdown
   * @returns {boolean}
   */
  isShutdown(): boolean {
    return !!this._impl;
  }

  /**
   * Schedule the msg for publishing - or publish immediately if we're
   * supposed to
   * @param msg {object} object type matching this._type
   * @param [throttleMs] {number} optional override for publisher setting
   */
  publish(msg: M, throttleMs?: number) {
    this._impl.publish(msg, throttleMs);
  }
}
