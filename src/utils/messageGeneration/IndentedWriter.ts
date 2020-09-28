import * as util from 'util';

export default class IndentedWriter {
  private _str: string = '';
  private _indentation: number = 0;

  write(...args: any[]): IndentedWriter {
    let formattedStr = util.format.apply(this, args);
    for (let i = 0; i < this._indentation; ++i) {
      this._str += '  ';
    }
    this._str += formattedStr;
    return this.newline();
  }

  newline(indentDir:number|undefined=undefined): IndentedWriter {
    this._str += '\n';
    if (indentDir === undefined) {
      return this;
    }
    else if (indentDir > 0) {
      return this.indent();
    }
    else if (indentDir < 0) {
      return this.dedent();
    }
    // else
    return this;
  }

  indent(...args: any[]): IndentedWriter {
    ++this._indentation;
    if (args.length > 0) {
      return this.write(...args);
    }
    // else
    return this;
  }

  isIndented(): boolean {
    return this._indentation > 0;
  }

  dedent(...args: any[]): IndentedWriter {
    --this._indentation;
    if (this._indentation < 0) {
      this.resetIndent();
    }
    if (arguments.length > 0) {
      return this.write(...args);
    }
    // else
    return this;
  }

  resetIndent(): IndentedWriter {
    this._indentation = 0;
    return this;
  }

  dividingLine(): IndentedWriter {
    return this.write('//-----------------------------------------------------------');
  }

  get(): string {
    return this._str;
  }
}
