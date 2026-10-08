const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');

// The shared packages import their own .ts files with .js specifiers.
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const next = resolve ?? context.resolveRequest;
  if (/^\.{1,2}\/.*\.js$/.test(moduleName)) {
    try {
      return next(context, moduleName.slice(0, -3), platform);
    } catch {
      // Fall through to the name as written.
    }
  }
  return next(context, moduleName, platform);
};

module.exports = config;
