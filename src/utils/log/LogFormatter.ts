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

import * as moment from 'moment';
import * as bunyan from 'bunyan';

type TokenName = 'severity' | 'time' | 'logger' | 'message' | 'isodate' | string;

const DEFAULT_FORMAT = '[${severity}] [${time}] (${logger}): ${message}';
const CONSOLE_FORMAT = process.env.ROSCONSOLE_JS_FORMAT || DEFAULT_FORMAT;
const CONSOLE_TOKEN_REGEX = /\${([a-z|A-Z]+)}/g;

class LogFormatter {
  _tokens: Token[] = [];
  _numTokens: number;

  constructor() {
    this._parseFormat();
    this._numTokens = this._tokens.length;
  }

  _parseFormat(): void {
    let match;
    let lastMatchIndex = 0;
    while ((match = CONSOLE_TOKEN_REGEX.exec(CONSOLE_FORMAT)) !== null) {
      const preToken = CONSOLE_FORMAT.substr(lastMatchIndex, match.index - lastMatchIndex);
      if (preToken.length > 0) {
        this._tokens.push(new DefaultToken(preToken));
      }
      this._tokens.push(this._getTokenizer(match[1]));
      lastMatchIndex = match.index + match[0].length;
    }
    const postToken = CONSOLE_FORMAT.substr(lastMatchIndex);
    if (postToken.length > 0) {
      this._tokens.push(new DefaultToken(postToken));
    }
  }

  _getTokenizer(token: TokenName) {
    switch(token) {
      case 'severity':
        return new SeverityToken();
      case 'message':
        return new MessageToken();
      case 'time':
        return new TimeToken();
      case 'logger':
        return new LoggerToken();
      case 'isodate':
        return new IsoDateToken();
      default:
        return new DefaultToken(token);
    }
  }

  format(rec: any) {
    const fields = this._tokens.map((token) => { return token.format(rec); });
    return fields.join('');
  }
}

// ----------------------------------------------------------------------------------------
// Tokens used for log formatting

class DefaultToken {
  val: TokenName;
  constructor(val: TokenName) {
    this.val = val;
  }

  format(): string {
    return this.val;
  }
}

class SeverityToken {
  format(rec: any): string {
    return bunyan.nameFromLevel[rec.level].toUpperCase();
  }
}

class MessageToken {
  format(rec: any): string {
    return rec.msg;
  }
}

class TimeToken {
  format(rec: any): string {
    const recTime = rec.time;
    return `${(recTime / 1000).toFixed(3)}`;
  }
}

class LoggerToken {
  format(rec: any): string {
    return rec.scope || rec.name;
  }
}

class IsoDateToken {
  format(rec: any): string {
    return moment(rec.time).format('YYYY-MM-DDTHH:mm:ss.SSSZZ')
  }
}

type Token = SeverityToken | MessageToken | TimeToken | LoggerToken | IsoDateToken | DefaultToken;

const logFormatter = new LogFormatter();

export default function formate(rec: any): string {
  return logFormatter.format(rec);
}
