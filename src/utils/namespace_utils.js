
/**
 * Check if a name is valid according to ros naming rules
 * http://wiki.ros.org/Names#Valid_Names
 * @param name {string}
 * @returns {boolean} true if valid
 */
function validate(name) {
  if ((typeof name === 'string') || (name instanceof String)) {
    return !!name.match(/^[a-zA-Z/~][a-zA-Z0-9_/]*$/);
  }
  // else
  return false;
}

/**
 * Resolves a name according to ros graph naming rules
 * http://wiki.ros.org/Names#Resolving
 * @param name {string} name to resolve
 * @param [namespace] {string} namespace for resolving relative names
 * @param [privateName] {string}
 * @returns {*}
 */
function resolve(name, namespace, privateName) {
  const first = name[0];
  if (first === '/') {
    // is a global namespace
    return name;
  }
  else if (first === '~') {
    // is a private namespace
    return resolve(stripLeadingSlash(`${privateName}/${name.substr(1)}`), namespace);
  }
  else if (namespace) {
    return `${namespace}/${name}`;
  }
  // else
  return `/${name}`;
}

function stripLeadingSlash(name) {
  if (name.startsWith('/')) {
    return name.substr(1);
  }
  return name;
}

module.exports = {
  resolve,
  validate,
  stripLeadingSlash
};