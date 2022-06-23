const CLEAN_REGEX = /\/\//g;

// http://wiki.ros.org/Names
class Names {
  constructor() {
    this._remappings = {};
    this._namespace = '';
  }

  init(remappings, namespace) {
    this._namespace = namespace;
    this._remappings = {};

    Object.keys(remappings).forEach((left) => {
      if (left && !left.startsWith('_')) {
        const right = remappings[left];

        const resolvedLeft = this.resolve(left, false);
        const resolvedRight = this.resolve(right, false);

        this._remappings[resolvedLeft] = resolvedRight;
      }
    });
  }

  validate(name, throwError = false) {
    if (typeof name !== 'string') {
      if (throwError) {
        throw new Error('Unable to validate non-string name');
      }
      return false;
    }

    const len = name.length;
    if (len === 0) {
      return true;
    }
    // else
    // First character must be alphanumeric, '/', or '~'
    const c = name[0];
    if (!isAlpha(c) && c !== '/' && c !== '~') {
      if (throwError) {
        throw new Error(`Character [${c}] is not valid as the first character in Graph Resource Name [${name}].  Valid characters are a-z, A-Z, / and in some cases ~.`);
      }
      // else
      return false;
    }

    for (let i = 1; i < len; ++i) {
      if (!isValidCharInName(name[i])) {
        if (throwError) {
          throw new Error(`Character [${name[i]}] at element [${i}] is not valid in Graph Resource Name [${name}].  Valid characters are a-z, A-Z, 0-9, / and _.`);
        }
        // else
        return false;
      }
    }

    return true;
  }

  clean(name) {
    name = name.replace(CLEAN_REGEX, '/');

    if (name.endsWith('/')) {
      return name.substr(0, -1);
    }
    // else
    return name;
  }

  append(left, right) {
    return this.clean(left + '/' + right);
  }

  remap(name) {
    return this.resolve(name, true);
  }

  /**
   * @param [namespace] {string} namespace to resolve name to. If not provided, node's namespace will be used
   * @param name {string} name to resolve
   * @param [remap] {bool} flag indicating if we should also attempt to remap the name
   */
  resolve(...args) {
    let [namespace, name, remap] = this._parseResolveArgs(args);

    this.validate(name, true);

    if (name.length === 0) {
      if (namespace.length === 0) {
        return '/';
      }
      else if (namespace[0] === '/') {
        return namespace
      }
      // else
      return '/' + namespace;
    }

    if (name.startsWith('~')) {
      name = name.replace('~', this._namespace + '/');
    }

    if (!name.startsWith('/')) {
      name = namespace + '/' + name;
    }

    name = this.clean(name);

    if (remap) {
      name = this._remap(name);
    }

    return name;
  }

  parentNamespace(name) {
    this.validate(name, true);

    if (name.length === 0) {
      return '';
    }
    else if (name === '/') {
      return '/';
    }

    let p = name.lastIndexOf('/');
    if (p === name.length - 1) {
      p = name.lastIndexOf('/', p - 1);
    }

    if (p < 0) {
      return '';
    }
    else if (p === 0) {
      return '/';
    }
    // else
    return name.substring(0, p);
  }

  _remap(name) {
    return this._remappings[name] || name;
  }

  _parseResolveArgs(args) {
    let name, namespace = this._namespace, remap = true;
    switch (args.length) {
      case 0:
        name = '';
        break;
      case 1:
        name = args[0];
        break;
      case 2:
        if (typeof args[1] === 'string') {
          [namespace, name] = args;
        }
        else {
          [name, remap] = args;
        }
        break;
      default:
        [namespace, name, remap] = args;
        break;
    }

    return [namespace, name, remap];
  }
}

module.exports = new Names();

//------------------------------------------------------------------
// Local Helper functions
//------------------------------------------------------------------



function isAlpha(char) {
  if (char >= 'A' && char <= 'Z') {
    return true;
  }
  else if (char >= 'a' && char <= 'z') {
    return true;
  }
  // else
  return false;
}

function isAlnum(char) {
  if (isAlpha(char)) {
    return true;
  }
  else if (char >= '0' && char <= '9') {
    return true;
  }
  // else
  return false;
}

function isValidCharInName(char) {
  return (isAlnum(char) || char == '/' || char == '_');
}
