const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(name) : [name];
  });
}
const files = ['public', 'server', 'shared', 'scripts', 'tests'].flatMap(
  (directory) => filesIn(path.join(root, directory))
);
const errors = [];
const scripts = files.filter((file) => file.endsWith('.js'));
for (const file of scripts) {
  const source = fs.readFileSync(file, 'utf8');
  try {
    new vm.Script(source, { filename: path.relative(root, file) });
  } catch (error) {
    errors.push(error.message);
  }
  for (const [, specifier] of source.matchAll(
    /require\(['"](\.[^'"]+)['"]\)/g
  )) {
    try {
      require.resolve(path.resolve(path.dirname(file), specifier));
    } catch {
      errors.push(`${path.relative(root, file)}: missing ${specifier}`);
    }
  }
  if (
    file.startsWith(path.join(root, 'public')) &&
    /\bconfirm\s*\(/.test(source)
  )
    errors.push(
      `${path.relative(root, file)}: use appConfirm for confirmations`
    );
}

const loader = fs.readFileSync(
  path.join(root, 'public/js/ui-loader.js'),
  'utf8'
);
const assets = [
  ...loader.matchAll(
    /['"]((?:\.\.\/shared|js\/|views\/)[^'"]+\.(?:js|html))['"]/g
  )
].map((match) => path.resolve(root, 'public', match[1]));
// Startup helpers load directly from index.html before the fragment loader.
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
for (const [, source] of index.matchAll(
  /<script\b[^>]*\bsrc=["']([^"'?#]+\.js)(?:[?#][^"']*)?["']/g
)) {
  if (!/^(?:https?:)?\/\//.test(source))
    assets.push(path.resolve(root, 'public', source));
}
for (const asset of assets)
  if (!fs.existsSync(asset))
    errors.push(`Missing browser asset: ${path.relative(root, asset)}`);
const apacheConfig = fs.readFileSync(path.join(root, '.htaccess'), 'utf8');
const sharedBlock = /RewriteRule (\^shared\/\S+) - \[F[^\]]*\]/.exec(
  apacheConfig
);
if (sharedBlock) {
  const deniedSharedPath = new RegExp(sharedBlock[1], 'i');
  for (const asset of assets.filter((name) =>
    name.startsWith(path.join(root, 'shared'))
  )) {
    const relative = path.relative(root, asset).replaceAll('\\', '/');
    if (deniedSharedPath.test(relative))
      errors.push(`Apache blocks browser asset: ${relative}`);
  }
}
for (const file of files.filter(
  (name) =>
    name.startsWith(path.join(root, 'public')) && /\.(js|html)$/.test(name)
))
  if (
    !['index.html', 'ui-loader.js'].includes(path.basename(file)) &&
    !assets.includes(file)
  )
    errors.push(`Browser file is not loaded: ${path.relative(root, file)}`);

const ids = new Map();
for (const file of files.filter((name) => name.endsWith('.html'))) {
  for (const [, id] of fs
    .readFileSync(file, 'utf8')
    .matchAll(/\bid="([^"]+)"/g)) {
    if (ids.has(id))
      errors.push(
        `Duplicate HTML ID ${id}: ${ids.get(id)} and ${path.relative(root, file)}`
      );
    ids.set(id, path.relative(root, file));
  }
}
if (errors.length) {
  errors.forEach((error) => console.error(error));
  process.exitCode = 1;
} else
  console.log(
    `Checked ${scripts.length} JavaScript files, browser assets, module paths, and HTML IDs.`
  );
